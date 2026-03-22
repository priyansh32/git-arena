import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cpus } from "node:os";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
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

export interface WorkspaceRuntimeMetrics {
  cpuMillicores: number;
  memoryMb: number;
  ephemeralStorageMb: number;
  processCount: number;
}

export interface WorkspaceHealthStatus {
  status: "healthy" | "unhealthy" | "unknown" | "unsupported";
  reason: string;
}

export interface WorkspaceScenarioRuntime {
  seedScript: string;
  evaluatorScript: string;
}

const BYTES_PER_MB = 1024 * 1024;

function toMb(bytes: number): number {
  return Math.max(0, Math.round(bytes / BYTES_PER_MB));
}

function parseCpuMillicores(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (trimmed.endsWith("n")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)) / 1_000_000);
  }

  if (trimmed.endsWith("u")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)) / 1_000);
  }

  if (trimmed.endsWith("m")) {
    return Math.round(Number.parseFloat(trimmed.slice(0, -1)));
  }

  return Math.round(Number.parseFloat(trimmed) * 1000);
}

function parseMemoryBytes(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([a-zA-Z]+)?$/);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  let unit = (match[2] ?? "B").toUpperCase();
  if (unit.endsWith("B") && unit !== "B") {
    unit = unit.slice(0, -1);
  }
  const unitTable: Record<string, number> = {
    B: 1,
    KI: 1024,
    MI: 1024 ** 2,
    GI: 1024 ** 3,
    TI: 1024 ** 4,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4
  };

  const multiplier = unitTable[unit] ?? 1;
  return Math.round(amount * multiplier);
}

function parseDockerMemUsageBytes(value: string): number {
  const [usage] = value.split("/");
  return parseMemoryBytes((usage ?? "").trim());
}

function parseDockerCpuMillicores(value: string): number {
  const trimmed = value.trim().replace("%", "");
  if (!trimmed) {
    return 0;
  }

  const cpuPercent = Number.parseFloat(trimmed);
  if (!Number.isFinite(cpuPercent) || cpuPercent <= 0) {
    return 0;
  }

  const hostCpuCount = Math.max(1, cpus().length);
  const usedCores = (cpuPercent / 100) * hostCpuCount;
  return Math.round(usedCores * 1000);
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseKilobytes(value: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 1024);
}

export class WorkspaceManager {
  constructor(private readonly config: WorkspaceConfig) {}

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

  private buildTerminalBootstrapCommand(): string {
    return [
      "export TERM=xterm-256color",
      "export GIT_PAGER=cat",
      "export PAGER=cat",
      "export LESS=FRX",
      `exec ${shellEscape(this.config.shell)} -i`
    ].join("; ");
  }

  getContainerName(sessionId: string): string {
    return `${this.config.containerPrefix}-${sessionId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
  }

  getPodName(sessionId: string): string {
    return `session-${sessionId}`.replace(/[^a-zA-Z0-9-]/g, "-");
  }

  getRuntimeHandle(sessionId: string): string {
    if (this.config.provider === "kubernetes") {
      return `${this.config.kubernetes.namespace}/${this.getPodName(sessionId)}`;
    }

    return this.getContainerName(sessionId);
  }

  async ensureWorkspace(session: Session, runtime: WorkspaceScenarioRuntime): Promise<void> {
    if (this.config.provider === "kubernetes") {
      await this.ensureKubernetesWorkspace(session, runtime);
      return;
    }

    await this.ensureDockerWorkspace(session, runtime);
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    if (this.config.provider === "kubernetes") {
      await this.removePodByName(this.getPodName(sessionId));
      return;
    }

    await this.removeWorkspaceByName(this.getContainerName(sessionId));
  }

  async evaluateWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<AssertionResult[]> {
    const output =
      this.config.provider === "kubernetes"
        ? await this.runScriptInPod(this.getPodName(session.id), runtime.evaluatorScript)
        : await this.runScriptInContainer(
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
    if (this.config.provider === "kubernetes") {
      return this.openKubernetesTerminal(sessionId);
    }

    return this.openDockerTerminal(sessionId);
  }

  async collectRuntimeMetrics(sessionId: string): Promise<WorkspaceRuntimeMetrics> {
    if (this.config.provider === "kubernetes") {
      return await this.collectKubernetesRuntimeMetrics(this.getPodName(sessionId));
    }

    return await this.collectDockerRuntimeMetrics(this.getContainerName(sessionId));
  }

  async findLargeWorkspaceFile(sessionId: string): Promise<string | null> {
    if (this.config.provider === "kubernetes") {
      const output = await this.runScriptInPod(
        this.getPodName(sessionId),
        "find /workspace -xdev -type f -size +50M -print -quit 2>/dev/null"
      );
      const firstPath = output.stdout.split("\n")[0]?.trim();
      return firstPath && firstPath.length > 0 ? firstPath : null;
    }

    const output = await this.runScriptInContainer(
      this.getContainerName(sessionId),
      "find /workspace -xdev -type f -size +50M -print -quit 2>/dev/null"
    );
    const firstPath = output.stdout.split("\n")[0]?.trim();
    return firstPath && firstPath.length > 0 ? firstPath : null;
  }

  async collectHealthStatus(sessionId: string): Promise<WorkspaceHealthStatus> {
    if (this.config.provider === "kubernetes") {
      return await this.collectKubernetesHealthStatus(this.getPodName(sessionId));
    }

    return await this.collectDockerHealthStatus(this.getContainerName(sessionId));
  }

  private async ensureDockerWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<void> {
    const containerName = this.getContainerName(session.id);
    const running = await this.isContainerRunning(containerName);

    if (running) {
      return;
    }

    await this.removeWorkspaceByName(containerName);
    await this.createWorkspaceContainer(containerName, session);

    try {
      await this.seedScenarioWorkspace(containerName, runtime.seedScript);
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
    const bootstrap = this.buildTerminalBootstrapCommand();
    const command = [
      "docker",
      "exec",
      "-it",
      containerName,
      this.config.shell,
      "-lc",
      bootstrap
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
    const bootstrap = this.buildTerminalBootstrapCommand();
    const targetArgs = this.getKubectlTargetArgs();
    const command = [
      "kubectl",
      ...targetArgs,
      "exec",
      "-it",
      "-n",
      this.config.kubernetes.namespace,
      podName,
      "--",
      this.config.shell,
      "-lc",
      bootstrap
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

  private async ensureKubernetesWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<void> {
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
      await this.seedScenarioPod(podName, runtime.seedScript);
      await this.markPodSeeded(podName);
      return;
    }

    await this.removePodByName(podName);
    await this.createWorkspacePod(podName, session);

    try {
      await this.waitForPodReady(podName);
      await this.seedScenarioPod(podName, runtime.seedScript);
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
    seedScript: string
  ): Promise<void> {
    await this.runScriptInContainer(containerName, seedScript);
  }

  private async seedScenarioPod(podName: string, seedScript: string): Promise<void> {
    await this.runScriptInPod(podName, seedScript);
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
    return await runScriptInKubernetesPod(
      this.config.kubernetes.namespace,
      podName,
      script,
      {
        context: this.config.kubernetes.context,
        kubeconfig: this.config.kubernetes.kubeconfig
      }
    );
  }

  private async collectDockerRuntimeMetrics(
    containerName: string
  ): Promise<WorkspaceRuntimeMetrics> {
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

    const processOutput = await this.runScriptInContainer(
      containerName,
      "ps -eo pid= | wc -l"
    );
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
      const duOutput = await this.runScriptInContainer(
        containerName,
        "du -sk /workspace /repos /tmp 2>/dev/null | awk '{total += $1} END {print total + 0}'"
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

  private async collectKubernetesRuntimeMetrics(
    podName: string
  ): Promise<WorkspaceRuntimeMetrics> {
    const metricsPath = `/apis/metrics.k8s.io/v1beta1/namespaces/${this.config.kubernetes.namespace}/pods/${podName}`;
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

    const processOutput = await this.runScriptInPod(podName, "ps -eo pid= | wc -l");
    const processCount = parseInteger(processOutput.stdout);

    const duOutput = await this.runScriptInPod(
      podName,
      "du -sk /workspace /repos /tmp 2>/dev/null | awk '{total += $1} END {print total + 0}'"
    );
    const ephemeralStorageMb = toMb(parseKilobytes(duOutput.stdout));

    return {
      cpuMillicores,
      memoryMb,
      ephemeralStorageMb,
      processCount
    };
  }

  private async collectDockerHealthStatus(
    containerName: string
  ): Promise<WorkspaceHealthStatus> {
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
      return {
        status: "unhealthy",
        reason: "container_missing"
      };
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
      return {
        status: "unsupported",
        reason: "docker_healthcheck_not_configured"
      };
    }

    if (healthStatus === "healthy") {
      return {
        status: "healthy",
        reason: "container_healthy"
      };
    }

    if (healthStatus === "unhealthy") {
      return {
        status: "unhealthy",
        reason: "container_healthcheck_unhealthy"
      };
    }

    if (healthStatus === "starting") {
      return {
        status: "unknown",
        reason: "container_healthcheck_starting"
      };
    }

    return {
      status: "unknown",
      reason: healthStatus.length > 0 ? `container_healthcheck_${healthStatus}` : "container_health_unknown"
    };
  }

  private async collectKubernetesHealthStatus(
    podName: string
  ): Promise<WorkspaceHealthStatus> {
    const output = await this.runKubectl(
      ["get", "pod", podName, "-n", this.config.kubernetes.namespace, "-o", "json"],
      true,
      undefined,
      30_000,
      1024 * 1024 * 2
    );

    if (!output) {
      return {
        status: "unhealthy",
        reason: "pod_missing"
      };
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
        return {
          status: "unknown",
          reason: "pod_pending"
        };
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
        return {
          status: "healthy",
          reason: "pod_ready"
        };
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
        return {
          status: "unknown",
          reason: waitingReason.toLowerCase()
        };
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
      return {
        status: "unknown",
        reason: "pod_status_parse_failed"
      };
    }
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
