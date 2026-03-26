import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "../config.js";
import { runKubectlCommand, runScriptInKubernetesPod } from "./command-runners.js";
import { K8S_SEEDED_ANNOTATION } from "./constants.js";
import { WorkspaceProvisionError } from "./errors.js";
import { parseAssertions } from "./parsing.js";
import { buildWorkspacePodManifest } from "./pod-manifest.js";
import { shellEscape } from "./shell.js";
import type { WorkspaceSpec } from "./spec.js";
import {
  toMb,
  parseCpuMillicores,
  parseMemoryBytes,
  parseInteger,
  parseKilobytes
} from "./unit-parsing.js";
import type {
  WorkspaceProvider,
  WorkspaceRuntimeMetrics,
  WorkspaceHealthStatus,
  WorkspaceScenarioRuntime
} from "./provider.js";

interface PodState {
  exists: boolean;
  phase: string | null;
  seeded: boolean;
}

export class KubernetesWorkspaceProvider implements WorkspaceProvider {
  constructor(private readonly config: WorkspaceConfig) {}

  private get ns(): string {
    return this.config.kubernetes.namespace;
  }

  private getPodName(sessionId: string): string {
    return `session-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, "-");
  }

  getRuntimeHandle(sessionId: string): string {
    return `${this.ns}/${this.getPodName(sessionId)}`;
  }

  async ensureWorkspace(session: Session, runtime: WorkspaceScenarioRuntime, spec: WorkspaceSpec): Promise<void> {
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
      await this.runScript(podName, runtime.seedScript);
      await this.markPodSeeded(podName);
      return;
    }

    await this.removePod(podName);
    await this.createPod(podName, session, spec);

    try {
      await this.waitForPodReady(podName);
      await this.runScript(podName, runtime.seedScript);
      await this.markPodSeeded(podName);
    } catch (error) {
      await this.removePod(podName);
      throw new WorkspaceProvisionError(
        `Unable to provision Kubernetes workspace pod for session ${session.id}`,
        error
      );
    }
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    await this.removePod(this.getPodName(sessionId));
  }

  async evaluateWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<AssertionResult[]> {
    const output = await this.runScript(
      this.getPodName(session.id),
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
    const podName = this.getPodName(sessionId);
    const targetArgs = this.getKubectlTargetArgs();
    const command = [
      "kubectl",
      ...targetArgs,
      "exec",
      "-it",
      "-n",
      this.ns,
      podName,
      "--",
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
    const podName = this.getPodName(sessionId);

    const metricsPath = `/apis/metrics.k8s.io/v1beta1/namespaces/${this.ns}/pods/${podName}`;
    const metricsOutput = await this.runKubectl(
      ["get", "--raw", metricsPath],
      true,
      undefined,
      30_000,
      1024 * 1024 * 2
    );

    let cpuMillicores = 0;
    let memoryMb = 0;
    if (metricsOutput) {
      try {
        const parsed = JSON.parse(metricsOutput) as {
          containers?: Array<{
            usage?: {
              cpu?: string;
              memory?: string;
            };
          }>;
        };
        const containers = Array.isArray(parsed.containers) ? parsed.containers : [];
        let totalCpu = 0;
        let totalMemory = 0;

        for (const container of containers) {
          totalCpu += parseCpuMillicores(container.usage?.cpu ?? "");
          totalMemory += parseMemoryBytes(container.usage?.memory ?? "");
        }

        cpuMillicores = Math.max(0, totalCpu);
        memoryMb = toMb(totalMemory);
      } catch {
        cpuMillicores = 0;
        memoryMb = 0;
      }
    }

    const processOutput = await this.runScript(podName, "ps -eo pid= | wc -l");
    const processCount = parseInteger(processOutput.stdout);

    const duOutput = await this.runScript(
      podName,
      "du -sk /workspace /tmp 2>/dev/null | awk '{total += $1} END {print total + 0}'"
    );
    const ephemeralStorageMb = toMb(parseKilobytes(duOutput.stdout));

    return {
      cpuMillicores,
      memoryMb,
      ephemeralStorageMb,
      processCount
    };
  }

  async collectHealthStatus(sessionId: string): Promise<WorkspaceHealthStatus> {
    const podName = this.getPodName(sessionId);

    const output = await this.runKubectl(
      ["get", "pod", podName, "-n", this.ns, "-o", "json"],
      true,
      undefined,
      30_000,
      1024 * 1024 * 2
    );

    if (!output) {
      return { status: "unhealthy", reason: "pod_missing" };
    }

    try {
      const parsed = JSON.parse(output) as {
        status?: {
          phase?: unknown;
          containerStatuses?: Array<{
            name?: unknown;
            ready?: unknown;
            state?: {
              waiting?: { reason?: unknown };
              terminated?: { reason?: unknown };
            };
          }>;
        };
      };

      const phase = typeof parsed.status?.phase === "string" ? parsed.status.phase : "";
      const normalizedPhase = phase.toLowerCase();

      if (normalizedPhase === "pending") {
        return { status: "unknown", reason: "pod_pending" };
      }

      if (normalizedPhase === "failed" || normalizedPhase === "succeeded") {
        return {
          status: "unhealthy",
          reason: normalizedPhase.length > 0 ? `pod_phase_${normalizedPhase}` : "pod_not_running"
        };
      }

      const statuses = Array.isArray(parsed.status?.containerStatuses)
        ? parsed.status?.containerStatuses
        : [];
      const challengeStatus =
        statuses.find((status) => status?.name === "challenge") ??
        statuses[0];

      if (!challengeStatus) {
        return {
          status: normalizedPhase === "running" ? "unknown" : "unhealthy",
          reason:
            normalizedPhase === "running"
              ? "container_status_missing"
              : `pod_phase_${normalizedPhase || "unknown"}`
        };
      }

      const ready = challengeStatus.ready === true;
      if (normalizedPhase === "running" && ready) {
        return { status: "healthy", reason: "pod_ready" };
      }

      const waitingReason =
        typeof challengeStatus.state?.waiting?.reason === "string"
          ? challengeStatus.state.waiting.reason
          : "";
      const terminatedReason =
        typeof challengeStatus.state?.terminated?.reason === "string"
          ? challengeStatus.state.terminated.reason
          : "";

      if (
        waitingReason === "ContainerCreating" ||
        waitingReason === "PodInitializing"
      ) {
        return { status: "unknown", reason: waitingReason.toLowerCase() };
      }

      if (normalizedPhase === "running" && !ready) {
        return {
          status: "unhealthy",
          reason: waitingReason || terminatedReason || "pod_not_ready"
        };
      }

      return {
        status: "unknown",
        reason: waitingReason || terminatedReason || `pod_phase_${normalizedPhase || "unknown"}`
      };
    } catch {
      return { status: "unknown", reason: "pod_status_parse_failed" };
    }
  }

  async findLargeWorkspaceFile(sessionId: string): Promise<string | null> {
    const output = await this.runScript(
      this.getPodName(sessionId),
      "find /workspace -xdev -type f -size +50M -print -quit 2>/dev/null"
    );
    const firstPath = output.stdout.split("\n")[0]?.trim();
    return firstPath && firstPath.length > 0 ? firstPath : null;
  }

  private getKubectlTargetArgs(): string[] {
    const args: string[] = [];
    if (this.config.kubernetes.kubeconfig) {
      args.push("--kubeconfig", this.config.kubernetes.kubeconfig);
    }
    if (this.config.kubernetes.context) {
      args.push("--context", this.config.kubernetes.context);
    }
    return args;
  }

  private async getPodState(podName: string): Promise<PodState> {
    const output = await this.runKubectl(
      ["get", "pod", podName, "-n", this.ns, "-o", "json"],
      true,
      undefined,
      30_000,
      1024 * 1024 * 2
    );

    if (!output) {
      return { exists: false, phase: null, seeded: false };
    }

    try {
      const parsed = JSON.parse(output) as {
        status?: { phase?: unknown };
        metadata?: { annotations?: Record<string, unknown> };
      };

      const phase = typeof parsed.status?.phase === "string" ? parsed.status.phase : null;
      const seeded = parsed.metadata?.annotations?.[K8S_SEEDED_ANNOTATION] === "true";

      return { exists: true, phase, seeded };
    } catch {
      return { exists: true, phase: null, seeded: false };
    }
  }

  private async createPod(podName: string, session: Session, spec: WorkspaceSpec): Promise<void> {
    const podManifest = buildWorkspacePodManifest(podName, session, this.config, spec);

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
        this.ns,
        "--for=condition=Ready",
        `pod/${podName}`,
        `--timeout=${timeoutSeconds}s`
      ]);
    } catch (error) {
      const describeOutput = await this.runKubectl(
        ["-n", this.ns, "describe", "pod", podName],
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
      this.ns,
      "pod",
      podName,
      `${K8S_SEEDED_ANNOTATION}=true`,
      "--overwrite"
    ]);
  }

  private async removePod(podName: string): Promise<void> {
    await this.runKubectl(
      ["delete", "pod", podName, "-n", this.ns, "--ignore-not-found=true", "--wait=false"],
      true
    );
  }

  private async runScript(
    podName: string,
    script: string
  ): Promise<{ stdout: string; stderr: string }> {
    return await runScriptInKubernetesPod(
      this.ns,
      podName,
      script,
      {
        context: this.config.kubernetes.context,
        kubeconfig: this.config.kubernetes.kubeconfig
      }
    );
  }

  private async runKubectl(
    args: string[],
    allowFailure = false,
    input?: string,
    timeout = 30_000,
    maxBuffer = 1024 * 1024
  ): Promise<string> {
    return await runKubectlCommand(args, {
      allowFailure,
      input,
      timeout,
      maxBuffer,
      context: this.config.kubernetes.context,
      kubeconfig: this.config.kubernetes.kubeconfig
    });
  }
}
