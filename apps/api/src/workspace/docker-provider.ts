import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "../config.js";
import { runDockerCommand, runScriptInDockerContainer } from "./command-runners.js";
import { buildWorkspaceContainerRunArgs } from "./docker-run-args.js";
import { WorkspaceProvisionError } from "./errors.js";
import { parseAssertions } from "./parsing.js";
import { shellEscape } from "./shell.js";
import type { WorkspaceSpec } from "./spec.js";
import {
  toMb,
  parseDockerMemUsageBytes,
  parseDockerCpuMillicores,
  parseInteger,
  parseKilobytes
} from "./unit-parsing.js";
import type {
  WorkspaceProvider,
  WorkspaceRuntimeMetrics,
  WorkspaceHealthStatus,
  WorkspaceScenarioRuntime
} from "./provider.js";

export class DockerWorkspaceProvider implements WorkspaceProvider {
  constructor(private readonly config: WorkspaceConfig) {}

  private getContainerName(sessionId: string): string {
    return `${this.config.containerPrefix}-${sessionId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
  }

  getRuntimeHandle(sessionId: string): string {
    return this.getContainerName(sessionId);
  }

  async ensureWorkspace(session: Session, runtime: WorkspaceScenarioRuntime, spec: WorkspaceSpec): Promise<void> {
    const containerName = this.getContainerName(session.id);
    const running = await this.isContainerRunning(containerName);

    if (running) {
      return;
    }

    await this.removeContainer(containerName);
    await this.createContainer(containerName, session, spec);

    try {
      await this.runScript(containerName, runtime.seedScript);
    } catch (error) {
      await this.removeContainer(containerName);
      throw new WorkspaceProvisionError(
        `Unable to seed scenario '${session.scenarioId}' for session ${session.id}`,
        error
      );
    }
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    await this.removeContainer(this.getContainerName(sessionId));
  }

  async evaluateWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<AssertionResult[]> {
    const output = await this.runScript(
      this.getContainerName(session.id),
      runtime.evaluatorScript
    );

    const assertions = parseAssertions(output.stdout);

    if (assertions.length === 0) {
      throw new WorkspaceProvisionError(
        `Scenario evaluator produced no assertions for '${session.scenarioId}'. Output: ${output.stdout || output.stderr || "<empty>"}`
      );
    }

    return assertions;
  }

  openTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    const containerName = this.getContainerName(sessionId);
    const command = [
      "docker",
      "exec",
      "-it",
      containerName,
      "/bin/bash",
      "-li"
    ]
      .map(shellEscape)
      .join(" ");

    return spawn("script", ["-qefc", command, "/dev/null"], {
      stdio: "pipe",
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    });
  }

  async collectRuntimeMetrics(sessionId: string): Promise<WorkspaceRuntimeMetrics> {
    const containerName = this.getContainerName(sessionId);

    const statsOutput = await this.runDocker(
      ["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", containerName],
      true
    );
    if (!statsOutput) {
      throw new WorkspaceProvisionError(
        `Unable to collect runtime metrics for container '${containerName}'`
      );
    }

    const [cpuRaw, memoryRaw] = statsOutput.split("|");
    const cpuMillicores = parseDockerCpuMillicores(cpuRaw ?? "");
    const memoryMb = toMb(parseDockerMemUsageBytes(memoryRaw ?? ""));

    const processOutput = await this.runScript(containerName, "ps -eo pid= | wc -l");
    const processCount = parseInteger(processOutput.stdout);

    const sizeOutput = await this.runDocker(
      ["inspect", "--size", "--format", "{{.SizeRw}}", containerName],
      true
    );
    const storageBytesFromInspect = Number.parseInt(sizeOutput.trim(), 10);

    let ephemeralStorageBytes = Number.isFinite(storageBytesFromInspect)
      ? storageBytesFromInspect
      : 0;
    if (ephemeralStorageBytes <= 0) {
      const duOutput = await this.runScript(
        containerName,
        "du -sk /workspace /tmp 2>/dev/null | awk '{total += $1} END {print total + 0}'"
      );
      ephemeralStorageBytes = parseKilobytes(duOutput.stdout);
    }

    return {
      cpuMillicores,
      memoryMb,
      ephemeralStorageMb: toMb(ephemeralStorageBytes),
      processCount
    };
  }

  async collectHealthStatus(sessionId: string): Promise<WorkspaceHealthStatus> {
    const containerName = this.getContainerName(sessionId);

    const output = await this.runDocker(
      [
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.Status}}",
        containerName
      ],
      true
    );

    if (!output) {
      return { status: "unhealthy", reason: "container_missing" };
    }

    const [healthStatusRaw, stateStatusRaw] = output.split("|");
    const healthStatus = (healthStatusRaw ?? "").trim().toLowerCase();
    const stateStatus = (stateStatusRaw ?? "").trim().toLowerCase();

    if (stateStatus !== "running") {
      return {
        status: "unhealthy",
        reason: stateStatus.length > 0 ? `container_state_${stateStatus}` : "container_not_running"
      };
    }

    if (healthStatus === "none") {
      return { status: "unsupported", reason: "docker_healthcheck_not_configured" };
    }

    if (healthStatus === "healthy") {
      return { status: "healthy", reason: "container_healthy" };
    }

    if (healthStatus === "unhealthy") {
      return { status: "unhealthy", reason: "container_healthcheck_unhealthy" };
    }

    if (healthStatus === "starting") {
      return { status: "unknown", reason: "container_healthcheck_starting" };
    }

    return {
      status: "unknown",
      reason: healthStatus.length > 0 ? `container_healthcheck_${healthStatus}` : "container_health_unknown"
    };
  }

  async findLargeWorkspaceFile(sessionId: string): Promise<string | null> {
    const output = await this.runScript(
      this.getContainerName(sessionId),
      "find /workspace -xdev -type f -size +50M -print -quit 2>/dev/null"
    );
    const firstPath = output.stdout.split("\n")[0]?.trim();
    return firstPath && firstPath.length > 0 ? firstPath : null;
  }

  private async isContainerRunning(containerName: string): Promise<boolean> {
    try {
      const stdout = await this.runDocker(
        ["inspect", "--format", "{{.State.Running}}", containerName],
        true
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  createContainer(containerName: string, session: Session, spec: WorkspaceSpec): Promise<void> {
    return this.provisionContainer(containerName, session, spec);
  }

  private async provisionContainer(containerName: string, session: Session, spec: WorkspaceSpec): Promise<void> {
    const args = buildWorkspaceContainerRunArgs(containerName, session, spec);

    try {
      await this.runDocker(args);
    } catch (error) {
      throw new WorkspaceProvisionError(
        `Unable to provision workspace container for session ${session.id}`,
        error
      );
    }
  }

  private async removeContainer(containerName: string): Promise<void> {
    await this.runDocker(["rm", "-f", containerName], true);
  }

  private async runScript(
    containerName: string,
    script: string
  ): Promise<{ stdout: string; stderr: string }> {
    return await runScriptInDockerContainer(containerName, script);
  }

  private async runDocker(args: string[], allowFailure = false): Promise<string> {
    return await runDockerCommand(args, { allowFailure });
  }
}
