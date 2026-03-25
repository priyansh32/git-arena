import type { AssertionResult, Session } from "@gitarena/shared";
import type { FastifyBaseLogger } from "fastify";

import type { Repository } from "./repository.js";
import {
  WorkspaceProvisionError,
  type WorkspaceHealthStatus,
  type WorkspaceMonitoringLimits,
  type WorkspaceRuntimeMetrics
} from "./workspace-manager.js";
import type { WorkspaceManager } from "./workspace-manager.js";
import { getWorkspaceSpec } from "./workspace/types.js";

const MONITOR_POLL_INTERVAL_MS = 30_000;
const HEALTH_CHECK_FAILURE_THRESHOLD = 3;
const CPU_ANOMALY_WINDOW_MS = 60 * 1000;
const CPU_TERMINATION_WINDOW_MS = 120 * 1000;

type TerminationReason =
  | "time_limit_exceeded"
  | "idle_timeout"
  | "memory_limit"
  | "disk_limit"
  | "process_limit"
  | "cpu_limit"
  | "health_check_failed";

interface SessionMonitorOptions {
  repository: Repository;
  workspaceManager: WorkspaceManager;
  imageOverride?: string;
  logger: FastifyBaseLogger;
  getLastWebsocketActivityMs: (sessionId: string) => number | null;
  notifyAndCloseSessionSocket: (sessionId: string, message: string) => void;
}

interface CpuOverageState {
  startedAtMs: number;
  warnedAt60s: boolean;
}

function buildTerminationMessage(reason: TerminationReason, limits: WorkspaceMonitoringLimits): string {
  if (reason === "time_limit_exceeded") {
    return "Session terminated: time limit exceeded. Your work was auto-submitted.";
  }
  if (reason === "idle_timeout") {
    return `Session terminated: idle timeout after ${Math.floor(limits.idleTimeoutMs / 60_000)} minutes of inactivity.`;
  }
  if (reason === "memory_limit") {
    return `Session terminated: memory limit exceeded (${limits.memoryTerminationMb}MB).`;
  }
  if (reason === "disk_limit") {
    return `Session terminated: ephemeral storage limit exceeded (${limits.ephemeralStorageTerminationMb}MB).`;
  }
  if (reason === "process_limit") {
    return "Session terminated: process limit exceeded.";
  }
  if (reason === "health_check_failed") {
    return "Session terminated: workspace health check failed repeatedly.";
  }
  return "Session terminated: CPU usage remained above threshold for too long.";
}

export class SessionMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;
  private pollInProgress = false;
  private readonly cpuOverages = new Map<string, CpuOverageState>();
  private readonly processAnomalyActive = new Set<string>();
  private readonly largeFileAnomalies = new Set<string>();
  private readonly healthCheckFailureCounts = new Map<string, number>();
  private readonly healthCheckUnsupportedLogged = new Set<string>();

  constructor(private readonly options: SessionMonitorOptions) {}

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, MONITOR_POLL_INTERVAL_MS);
    void this.poll();
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.pollInProgress) {
      return;
    }
    this.pollInProgress = true;

    try {
      const activeSessions = await this.options.repository.listActiveSessionsForMonitor();
      const activeSessionIds = new Set(activeSessions.map((entry) => entry.session.id));
      this.pruneState(activeSessionIds);

      for (const entry of activeSessions) {
        try {
          await this.pollSession(entry.session, entry.timeLimitSeconds, entry.workspaceType);
        } catch (error) {
          this.options.logger.error(
            { error, sessionId: entry.session.id },
            "Session monitor failed for one session"
          );
        }
      }
    } catch (error) {
      this.options.logger.error({ error }, "Session monitor poll failed");
    } finally {
      this.pollInProgress = false;
    }
  }

  private getMonitoringLimits(workspaceType: string): WorkspaceMonitoringLimits {
    return getWorkspaceSpec(workspaceType, this.options.imageOverride).monitoring;
  }

  private async pollSession(session: Session, timeLimitSeconds: number, workspaceType: string): Promise<void> {
    const nowMs = Date.now();
    const startedAtMs = Date.parse(session.startedAt);
    const elapsedSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
      : 0;

    const limits = this.getMonitoringLimits(workspaceType);
    const metrics = await this.safeCollectMetrics(session);
    const healthStatus = await this.safeCollectHealthStatus(session);

    if (elapsedSeconds > timeLimitSeconds) {
      await this.autoSubmitAndTerminate(session, metrics, elapsedSeconds, workspaceType);
      return;
    }

    const healthCheckTerminated = await this.handleHealthStatus(
      session,
      healthStatus,
      metrics,
      elapsedSeconds,
      limits
    );
    if (healthCheckTerminated) {
      return;
    }

    const lastActivityMs =
      this.options.getLastWebsocketActivityMs(session.id) ??
      (Number.isFinite(startedAtMs) ? startedAtMs : nowMs);
    const idleMs = Math.max(0, nowMs - lastActivityMs);
    if (idleMs > limits.idleTimeoutMs) {
      await this.terminateSession(session, "idle_timeout", metrics, elapsedSeconds, limits);
      return;
    }

    if (metrics.memoryMb > limits.memoryTerminationMb) {
      await this.terminateSession(session, "memory_limit", metrics, elapsedSeconds, limits);
      return;
    }

    if (metrics.ephemeralStorageMb > limits.ephemeralStorageTerminationMb) {
      await this.terminateSession(session, "disk_limit", metrics, elapsedSeconds, limits);
      return;
    }

    if (metrics.processCount > limits.processTerminationThreshold) {
      await this.terminateSession(session, "process_limit", metrics, elapsedSeconds, limits);
      return;
    }

    if (metrics.processCount > limits.processAnomalyThreshold) {
      if (!this.processAnomalyActive.has(session.id)) {
        this.processAnomalyActive.add(session.id);
        this.logAuditEvent(session, "session.anomaly_detected", {
          anomaly_type: "process_count_warning",
          process_count: metrics.processCount
        });
      }
    } else {
      this.processAnomalyActive.delete(session.id);
    }

    const largeFilePath = await this.safeFindLargeWorkspaceFile(session);
    if (largeFilePath) {
      const anomalyKey = `${session.id}:${largeFilePath}`;
      if (!this.largeFileAnomalies.has(anomalyKey)) {
        this.largeFileAnomalies.add(anomalyKey);
        this.logAuditEvent(session, "session.anomaly_detected", {
          anomaly_type: "large_workspace_file",
          file_path: largeFilePath
        });
      }
    }

    await this.handleCpuOverage(session, metrics, elapsedSeconds, nowMs, limits);
  }

  private async safeCollectMetrics(session: Session): Promise<WorkspaceRuntimeMetrics> {
    try {
      return await this.options.workspaceManager.collectRuntimeMetrics(session.id);
    } catch (error) {
      this.options.logger.warn(
        { error, sessionId: session.id },
        "Unable to collect runtime metrics for monitor poll"
      );
      return {
        cpuMillicores: 0,
        memoryMb: 0,
        ephemeralStorageMb: 0,
        processCount: 0
      };
    }
  }

  private async safeCollectHealthStatus(
    session: Session
  ): Promise<WorkspaceHealthStatus> {
    try {
      return await this.options.workspaceManager.collectHealthStatus(session.id);
    } catch (error) {
      this.options.logger.warn(
        { error, sessionId: session.id },
        "Unable to collect health status for monitor poll"
      );
      return {
        status: "unknown",
        reason: "health_collection_failed"
      };
    }
  }

  private async safeFindLargeWorkspaceFile(session: Session): Promise<string | null> {
    try {
      return await this.options.workspaceManager.findLargeWorkspaceFile(session.id);
    } catch {
      return null;
    }
  }

  private async handleCpuOverage(
    session: Session,
    metrics: WorkspaceRuntimeMetrics,
    elapsedSeconds: number,
    nowMs: number,
    limits: WorkspaceMonitoringLimits
  ): Promise<void> {
    if (metrics.cpuMillicores <= limits.cpuTerminationMillicores) {
      this.cpuOverages.delete(session.id);
      return;
    }

    const existing = this.cpuOverages.get(session.id);
    if (!existing) {
      this.cpuOverages.set(session.id, {
        startedAtMs: nowMs,
        warnedAt60s: false
      });
      return;
    }

    const overageDurationMs = Math.max(0, nowMs - existing.startedAtMs);
    if (!existing.warnedAt60s && overageDurationMs >= CPU_ANOMALY_WINDOW_MS) {
      this.logAuditEvent(session, "session.anomaly_detected", {
        anomaly_type: "cpu_sustained_high",
        cpu_millicores: metrics.cpuMillicores,
        sustained_seconds: Math.floor(overageDurationMs / 1000)
      });
      this.cpuOverages.set(session.id, {
        startedAtMs: existing.startedAtMs,
        warnedAt60s: true
      });
    }

    if (overageDurationMs >= CPU_TERMINATION_WINDOW_MS) {
      await this.terminateSession(session, "cpu_limit", metrics, elapsedSeconds, limits);
    }
  }

  private async handleHealthStatus(
    session: Session,
    healthStatus: WorkspaceHealthStatus,
    metrics: WorkspaceRuntimeMetrics,
    elapsedSeconds: number,
    limits: WorkspaceMonitoringLimits
  ): Promise<boolean> {
    if (healthStatus.status === "healthy") {
      this.healthCheckFailureCounts.delete(session.id);
      this.healthCheckUnsupportedLogged.delete(session.id);
      return false;
    }

    if (healthStatus.status === "unsupported") {
      if (!this.healthCheckUnsupportedLogged.has(session.id)) {
        this.healthCheckUnsupportedLogged.add(session.id);
        this.options.logger.warn(
          {
            sessionId: session.id,
            reason: healthStatus.reason
          },
          "Health-check termination trigger is unsupported for this workspace runtime"
        );
      }
      this.healthCheckFailureCounts.delete(session.id);
      return false;
    }

    if (healthStatus.status === "unknown") {
      this.healthCheckFailureCounts.delete(session.id);
      return false;
    }

    const nextFailureCount = (this.healthCheckFailureCounts.get(session.id) ?? 0) + 1;
    this.healthCheckFailureCounts.set(session.id, nextFailureCount);

    if (nextFailureCount < HEALTH_CHECK_FAILURE_THRESHOLD) {
      this.logAuditEvent(session, "session.anomaly_detected", {
        anomaly_type: "health_check_failed",
        failure_count: nextFailureCount,
        health_reason: healthStatus.reason
      });
      return false;
    }

    await this.terminateSession(session, "health_check_failed", metrics, elapsedSeconds, limits);
    return true;
  }

  private async autoSubmitAndTerminate(
    session: Session,
    metrics: WorkspaceRuntimeMetrics,
    elapsedSeconds: number,
    workspaceType: string
  ): Promise<void> {
    this.logAuditEvent(session, "session.auto_submitted", {
      reason: "time_limit_exceeded"
    });

    const limits = this.getMonitoringLimits(workspaceType);
    const assertions = await this.runAutoEvaluation(session, workspaceType);
    const submitResult = await this.options.repository.submitSession(
      session.id,
      session.userId,
      assertions
    );
    if (!submitResult) {
      this.options.logger.warn(
        { sessionId: session.id },
        "Auto-submit did not persist; session likely already closed"
      );
    }

    await this.terminateSession(
      session,
      "time_limit_exceeded",
      metrics,
      elapsedSeconds,
      limits
    );
  }

  private async runAutoEvaluation(session: Session, workspaceType: string): Promise<AssertionResult[] | undefined> {
    try {
      const runtime = await this.options.repository.getScenarioRuntimeForSession(session.id);
      if (!runtime) {
        throw new Error(`Scenario runtime not found for session '${session.id}'`);
      }
      const spec = getWorkspaceSpec(workspaceType, this.options.imageOverride);
      await this.options.workspaceManager.ensureWorkspace(session, runtime, spec);
      return await this.options.workspaceManager.evaluateWorkspace(session, runtime);
    } catch (error) {
      this.options.logger.error(
        { error, sessionId: session.id, scenarioId: session.scenarioId },
        "Auto-submit evaluator failed"
      );

      return [
        {
          checkId: "evaluator_runtime",
          passed: false,
          explanation:
            "The evaluator could not run during auto-submit. Submission was marked failed.",
          weight: 100
        }
      ];
    }
  }

  private async terminateSession(
    session: Session,
    reason: TerminationReason,
    metrics: WorkspaceRuntimeMetrics,
    elapsedSeconds: number,
    limits: WorkspaceMonitoringLimits
  ): Promise<void> {
    this.logAuditEvent(session, "session.terminated", {
      reason,
      container_id: this.options.workspaceManager.getRuntimeHandle(session.id),
      metrics_at_termination: {
        memory_mb: metrics.memoryMb,
        cpu_millicores: metrics.cpuMillicores,
        ephemeral_storage_mb: metrics.ephemeralStorageMb,
        process_count: metrics.processCount,
        elapsed_seconds: elapsedSeconds
      }
    });

    this.options.notifyAndCloseSessionSocket(session.id, buildTerminationMessage(reason, limits));

    const terminatedSession = await this.options.repository.terminateSessionByMonitor(
      session.id,
      reason
    );
    if (!terminatedSession) {
      return;
    }

    try {
      await this.options.workspaceManager.stopWorkspace(session.id);
    } catch (error) {
      if (!(error instanceof WorkspaceProvisionError)) {
        this.options.logger.warn(
          { error, sessionId: session.id },
          "Workspace cleanup after monitor termination failed"
        );
      }
    }

    this.clearSessionState(session.id);
  }

  private logAuditEvent(
    session: Session,
    eventType: string,
    details: Record<string, unknown>
  ): void {
    this.options.logger.info({
      timestamp: new Date().toISOString(),
      session_id: session.id,
      user_id: session.userId,
      scenario_id: session.scenarioId,
      event_type: eventType,
      ...details
    });
  }

  private pruneState(activeSessionIds: Set<string>): void {
    for (const sessionId of this.cpuOverages.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.cpuOverages.delete(sessionId);
      }
    }

    for (const sessionId of this.processAnomalyActive.values()) {
      if (!activeSessionIds.has(sessionId)) {
        this.processAnomalyActive.delete(sessionId);
      }
    }

    for (const key of this.largeFileAnomalies.values()) {
      const [sessionId] = key.split(":");
      if (!activeSessionIds.has(sessionId)) {
        this.largeFileAnomalies.delete(key);
      }
    }

    for (const sessionId of this.healthCheckFailureCounts.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.healthCheckFailureCounts.delete(sessionId);
      }
    }

    for (const sessionId of this.healthCheckUnsupportedLogged.values()) {
      if (!activeSessionIds.has(sessionId)) {
        this.healthCheckUnsupportedLogged.delete(sessionId);
      }
    }
  }

  private clearSessionState(sessionId: string): void {
    this.cpuOverages.delete(sessionId);
    this.processAnomalyActive.delete(sessionId);
    this.healthCheckFailureCounts.delete(sessionId);
    this.healthCheckUnsupportedLogged.delete(sessionId);

    for (const key of this.largeFileAnomalies.values()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.largeFileAnomalies.delete(key);
      }
    }
  }
}
