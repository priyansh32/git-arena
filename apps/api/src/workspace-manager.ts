import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
import { getScenarioRuntime } from "./scenario-runtime.js";
import {
  runDockerCommand,
  runKubectlCommand,
  runScriptInDockerContainer,
  runScriptInKubernetesPod
} from "./workspace/command-runners.js";
import { K8S_SEEDED_ANNOTATION } from "./workspace/constants.js";
import { buildWorkspaceContainerRunArgs } from "./workspace/docker-run-args.js";
import { WorkspaceProvisionError } from "./workspace/errors.js";
import { parseAssertions } from "./workspace/parsing.js";
import { buildWorkspacePodManifest } from "./workspace/pod-manifest.js";
import { shellEscape } from "./workspace/shell.js";
export { WorkspaceProvisionError } from "./workspace/errors.js";

interface PodState {
  exists: boolean;
  phase: string | null;
  seeded: boolean;
}

export class WorkspaceManager {
  constructor(private readonly config: WorkspaceConfig) {}

  getContainerName(sessionId: string): string {
    return `${this.config.containerPrefix}-${sessionId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
  }

  getPodName(sessionId: string): string {
    return `session-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, "-");
  }

  async ensureWorkspace(session: Session): Promise<void> {
    if (this.config.provider === "kubernetes") {
      await this.ensureKubernetesWorkspace(session);
      return;
    }

    await this.ensureDockerWorkspace(session);
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    if (this.config.provider === "kubernetes") {
      await this.removePodByName(this.getPodName(sessionId));
      return;
    }

    await this.removeWorkspaceByName(this.getContainerName(sessionId));
  }

  async evaluateWorkspace(session: Session): Promise<AssertionResult[]> {
    const output =
      this.config.provider === "kubernetes"
        ? await this.runScriptInPod(this.getPodName(session.id), getScenarioRuntime(session.scenarioId).evaluatorScript)
        : await this.runScriptInContainer(this.getContainerName(session.id), getScenarioRuntime(session.scenarioId).evaluatorScript);

    const assertions = parseAssertions(output.stdout);

    if (assertions.length === 0) {
      throw new WorkspaceProvisionError(
        `Scenario evaluator produced no assertions for '${session.scenarioId}'. Output: ${output.stdout || output.stderr || "<empty>"}`
      );
    }

    return assertions;
  }

  openTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    if (this.config.provider === "kubernetes") {
      return this.openKubernetesTerminal(sessionId);
    }

    return this.openDockerTerminal(sessionId);
  }

  private async ensureDockerWorkspace(session: Session): Promise<void> {
    const containerName = this.getContainerName(session.id);
    const running = await this.isContainerRunning(containerName);

    if (running) {
      return;
    }

    await this.removeWorkspaceByName(containerName);
    await this.createWorkspaceContainer(containerName, session);

    try {
      await this.seedScenarioWorkspace(containerName, session.scenarioId);
    } catch (error) {
      await this.removeWorkspaceByName(containerName);
      throw new WorkspaceProvisionError(
        `Unable to seed scenario '${session.scenarioId}' for session ${session.id}`,
        error
      );
    }
  }

  private openDockerTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    const containerName = this.getContainerName(sessionId);
    const command = [
      "docker",
      "exec",
      "-it",
      "--env",
      "TERM=xterm-256color",
      containerName,
      this.config.shell,
      "-i"
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

  private openKubernetesTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    const podName = this.getPodName(sessionId);
    const command = [
      "kubectl",
      "exec",
      "-it",
      "-n",
      this.config.kubernetes.namespace,
      podName,
      "--",
      this.config.shell,
      "-i"
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

  private async ensureKubernetesWorkspace(session: Session): Promise<void> {
    const podName = this.getPodName(session.id);
    const podState = await this.getPodState(podName);

    if (podState.exists && podState.phase === "Running" && podState.seeded) {
      return;
    }

    if (podState.exists && podState.phase === "Pending") {
      await this.waitForPodReady(podName);
      const refreshedState = await this.getPodState(podName);
      if (refreshedState.seeded) {
        return;
      }
      await this.seedScenarioPod(podName, session.scenarioId);
      await this.markPodSeeded(podName);
      return;
    }

    await this.removePodByName(podName);
    await this.createWorkspacePod(podName, session);

    try {
      await this.waitForPodReady(podName);
      await this.seedScenarioPod(podName, session.scenarioId);
      await this.markPodSeeded(podName);
    } catch (error) {
      await this.removePodByName(podName);
      throw new WorkspaceProvisionError(
        `Unable to provision Kubernetes workspace pod for session ${session.id}`,
        error
      );
    }
  }

  private async createWorkspaceContainer(containerName: string, session: Session): Promise<void> {
    const args = buildWorkspaceContainerRunArgs(containerName, session, this.config);

    try {
      await this.runDocker(args);
    } catch (error) {
      throw new WorkspaceProvisionError(
        `Unable to provision workspace container for session ${session.id}`,
        error
      );
    }
  }

  private async createWorkspacePod(podName: string, session: Session): Promise<void> {
    const podManifest = buildWorkspacePodManifest(podName, session, this.config);

    try {
      await this.runKubectl(["apply", "-f", "-"], false, JSON.stringify(podManifest), 30_000, 1024 * 1024 * 4);
    } catch (error) {
      throw new WorkspaceProvisionError(`Unable to create workspace pod '${podName}'`, error);
    }
  }

  private async waitForPodReady(podName: string): Promise<void> {
    const timeoutSeconds = this.config.kubernetes.podReadyTimeoutSeconds;

    try {
      await this.runKubectl([
        "wait",
        "-n",
        this.config.kubernetes.namespace,
        "--for=condition=Ready",
        `pod/${podName}`,
        `--timeout=${timeoutSeconds}s`
      ]);
    } catch (error) {
      const describeOutput = await this.runKubectl(
        ["-n", this.config.kubernetes.namespace, "describe", "pod", podName],
        true,
        undefined,
        30_000,
        1024 * 1024 * 4
      );

      throw new WorkspaceProvisionError(
        `Pod '${podName}' did not become ready within ${timeoutSeconds}s. ${describeOutput ? `kubectl describe output:\n${describeOutput}` : ""}`,
        error
      );
    }
  }

  private async markPodSeeded(podName: string): Promise<void> {
    await this.runKubectl([
      "annotate",
      "-n",
      this.config.kubernetes.namespace,
      "pod",
      podName,
      `${K8S_SEEDED_ANNOTATION}=true`,
      "--overwrite"
    ]);
  }

  private async getPodState(podName: string): Promise<PodState> {
    const output = await this.runKubectl(
      ["get", "pod", podName, "-n", this.config.kubernetes.namespace, "-o", "json"],
      true,
      undefined,
      30_000,
      1024 * 1024 * 2
    );

    if (!output) {
      return {
        exists: false,
        phase: null,
        seeded: false
      };
    }

    try {
      const parsed = JSON.parse(output) as {
        status?: { phase?: unknown };
        metadata?: { annotations?: Record<string, unknown> };
      };

      const phase = typeof parsed.status?.phase === "string" ? parsed.status.phase : null;
      const seeded = parsed.metadata?.annotations?.[K8S_SEEDED_ANNOTATION] === "true";

      return {
        exists: true,
        phase,
        seeded
      };
    } catch {
      return {
        exists: true,
        phase: null,
        seeded: false
      };
    }
  }

  private async seedScenarioWorkspace(
    containerName: string,
    scenarioId: string
  ): Promise<void> {
    const runtime = getScenarioRuntime(scenarioId);
    await this.runScriptInContainer(containerName, runtime.seedScript);
  }

  private async seedScenarioPod(podName: string, scenarioId: string): Promise<void> {
    const runtime = getScenarioRuntime(scenarioId);
    await this.runScriptInPod(podName, runtime.seedScript);
  }

  private async runScriptInContainer(
    containerName: string,
    script: string
  ): Promise<{ stdout: string; stderr: string }> {
    return await runScriptInDockerContainer(containerName, script);
  }

  private async runScriptInPod(
    podName: string,
    script: string
  ): Promise<{ stdout: string; stderr: string }> {
    return await runScriptInKubernetesPod(this.config.kubernetes.namespace, podName, script);
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

  private async removeWorkspaceByName(containerName: string): Promise<void> {
    await this.runDocker(["rm", "-f", containerName], true);
  }

  private async removePodByName(podName: string): Promise<void> {
    await this.runKubectl(
      ["delete", "pod", podName, "-n", this.config.kubernetes.namespace, "--ignore-not-found=true", "--wait=false"],
      true
    );
  }

  private async runDocker(args: string[], allowFailure = false): Promise<string> {
    return await runDockerCommand(args, { allowFailure });
  }

  private async runKubectl(
    args: string[],
    allowFailure = false,
    input?: string,
    timeout = 30_000,
    maxBuffer = 1024 * 1024
  ): Promise<string> {
    return await runKubectlCommand(args, { allowFailure, input, timeout, maxBuffer });
  }
}
