import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceSpec } from "./spec.js";

export type { WorkspaceSpec, WorkspaceMonitoringLimits } from "./spec.js";

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

export interface WorkspaceProvider {
  getRuntimeHandle(sessionId: string): string;
  ensureWorkspace(session: Session, runtime: WorkspaceScenarioRuntime, spec: WorkspaceSpec): Promise<void>;
  stopWorkspace(sessionId: string): Promise<void>;
  evaluateWorkspace(session: Session, runtime: WorkspaceScenarioRuntime): Promise<AssertionResult[]>;
  openTerminal(sessionId: string): ChildProcessWithoutNullStreams;
  collectRuntimeMetrics(sessionId: string): Promise<WorkspaceRuntimeMetrics>;
  collectHealthStatus(sessionId: string): Promise<WorkspaceHealthStatus>;
  findLargeWorkspaceFile(sessionId: string): Promise<string | null>;
}
