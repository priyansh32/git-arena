import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
import { DockerWorkspaceProvider } from "./workspace/docker-provider.js";
import { KubernetesWorkspaceProvider } from "./workspace/kubernetes-provider.js";
import type {
  WorkspaceProvider,
  WorkspaceRuntimeMetrics,
  WorkspaceHealthStatus,
  WorkspaceScenarioRuntime
} from "./workspace/provider.js";
import type { WorkspaceSpec } from "./workspace/spec.js";

export { WorkspaceProvisionError } from "./workspace/errors.js";
export type { WorkspaceRuntimeMetrics, WorkspaceHealthStatus, WorkspaceScenarioRuntime } from "./workspace/provider.js";
export type { WorkspaceSpec, WorkspaceMonitoringLimits } from "./workspace/spec.js";

export class WorkspaceManager {
  private readonly provider: WorkspaceProvider;

  constructor(config: WorkspaceConfig) {
    this.provider =
      config.provider === "kubernetes"
        ? new KubernetesWorkspaceProvider(config)
        : new DockerWorkspaceProvider(config);
  }

  getRuntimeHandle(sessionId: string): string {
    return this.provider.getRuntimeHandle(sessionId);
  }

  async ensureWorkspace(session: Session, runtime: WorkspaceScenarioRuntime, spec: WorkspaceSpec): Promise<void> {
    return this.provider.ensureWorkspace(session, runtime, spec);
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    return this.provider.stopWorkspace(sessionId);
  }

  async evaluateWorkspace(
    session: Session,
    runtime: WorkspaceScenarioRuntime
  ): Promise<AssertionResult[]> {
    return this.provider.evaluateWorkspace(session, runtime);
  }

  openTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    return this.provider.openTerminal(sessionId);
  }

  async collectRuntimeMetrics(sessionId: string): Promise<WorkspaceRuntimeMetrics> {
    return this.provider.collectRuntimeMetrics(sessionId);
  }

  async collectHealthStatus(sessionId: string): Promise<WorkspaceHealthStatus> {
    return this.provider.collectHealthStatus(sessionId);
  }

  async findLargeWorkspaceFile(sessionId: string): Promise<string | null> {
    return this.provider.findLargeWorkspaceFile(sessionId);
  }
}
