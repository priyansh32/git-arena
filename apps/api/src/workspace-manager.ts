import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";

import type { AssertionResult, Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
import { getScenarioRuntime } from "./scenario-runtime.js";

const execFileAsync = promisify(execFile);
const ASSERTION_LINE_PATTERN = /^ASSERT:([^:]+):(PASS|FAIL):([0-9]+):(.*)$/;
const K8S_SEEDED_ANNOTATION = "gitarena.dev/seeded";
const POLICY_ENV_ALLOWLIST = [
  { name: "HOME", value: "/home/gituser" },
  { name: "SHELL", value: "/bin/bash" },
  { name: "TERM", value: "xterm-256color" },
  { name: "GIT_AUTHOR_NAME", value: "Git Arena" },
  { name: "GIT_AUTHOR_EMAIL", value: "user@gitarena.dev" },
  { name: "GIT_COMMITTER_NAME", value: "Git Arena" },
  { name: "GIT_COMMITTER_EMAIL", value: "user@gitarena.dev" },
  { name: "LANG", value: "en_US.UTF-8" }
] as const;

interface PodState {
  exists: boolean;
  phase: string | null;
  seeded: boolean;
}

export class WorkspaceProvisionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "WorkspaceProvisionError";
  }
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
    const args = [
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--label",
      "gitarena.workspace=true",
      "--label",
      `gitarena.session.id=${session.id}`,
      "--label",
      `gitarena.user.id=${session.userId}`,
      "-w",
      this.config.rootDir,
      "--entrypoint",
      "sh",
      this.config.image,
      "-lc",
      this.config.initCommand
    ];

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
    const podManifest = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: podName,
        namespace: this.config.kubernetes.namespace,
        labels: {
          app: "challenge-session",
          "session-id": session.id,
          "user-id": session.userId,
          "scenario-id": session.scenarioId
        },
        annotations: {
          [K8S_SEEDED_ANNOTATION]: "false"
        }
      },
      spec: {
        runtimeClassName: this.config.kubernetes.runtimeClassName,
        automountServiceAccountToken: false,
        enableServiceLinks: false,
        serviceAccountName: "",
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          seccompProfile: {
            type: "RuntimeDefault"
          }
        },
        restartPolicy: "Never",
        terminationGracePeriodSeconds: 10,
        containers: [
          {
            name: "challenge",
            image: this.config.image,
            imagePullPolicy: this.config.kubernetes.imagePullPolicy,
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: false,
              capabilities: {
                drop: ["ALL"]
              }
            },
            resources: {
              requests: {
                memory: "128Mi",
                cpu: "250m"
              },
              limits: {
                memory: "256Mi",
                cpu: "500m",
                "ephemeral-storage": "1Gi"
              }
            },
            env: POLICY_ENV_ALLOWLIST,
            ports: [
              {
                containerPort: 7681,
                protocol: "TCP"
              }
            ],
            livenessProbe: {
              exec: {
                command: ["/bin/bash", "-lc", "echo > /dev/tcp/127.0.0.1/7681"]
              },
              initialDelaySeconds: 5,
              timeoutSeconds: 2,
              periodSeconds: 10
            }
          }
        ]
      }
    };

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
    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["exec", "-i", containerName, "sh", "-lc", script],
        {
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 4
        }
      );

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      const message = this.formatDockerError(error);
      throw new WorkspaceProvisionError(message, error);
    }
  }

  private async runScriptInPod(
    podName: string,
    script: string
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(
        "kubectl",
        [
          "exec",
          "-i",
          "-n",
          this.config.kubernetes.namespace,
          podName,
          "--",
          "sh",
          "-lc",
          script
        ],
        {
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 4
        }
      );

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      const message = this.formatKubectlError(error);
      throw new WorkspaceProvisionError(message, error);
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
    try {
      const { stdout } = await execFileAsync("docker", args, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    } catch (error) {
      if (allowFailure) {
        return "";
      }

      const message = this.formatDockerError(error);
      throw new WorkspaceProvisionError(message, error);
    }
  }

  private async runKubectl(
    args: string[],
    allowFailure = false,
    input?: string,
    timeout = 30_000,
    maxBuffer = 1024 * 1024
  ): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("kubectl", args, {
        stdio: "pipe"
      });

      let stdout = "";
      let stderr = "";
      let done = false;
      let timedOut = false;
      let exceededBuffer = false;

      const finish = (callback: () => void): void => {
        if (done) {
          return;
        }
        done = true;
        callback();
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);

      const appendAndCheck = (target: "stdout" | "stderr", chunk: Buffer): void => {
        if (target === "stdout") {
          stdout += chunk.toString("utf8");
        } else {
          stderr += chunk.toString("utf8");
        }

        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBuffer) {
          exceededBuffer = true;
          child.kill("SIGKILL");
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        appendAndCheck("stdout", chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        appendAndCheck("stderr", chunk);
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        finish(() => {
          if (allowFailure) {
            resolve("");
            return;
          }
          reject(new WorkspaceProvisionError(this.formatKubectlError(error), error));
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        finish(() => {
          if (timedOut) {
            if (allowFailure) {
              resolve("");
              return;
            }
            reject(
              new WorkspaceProvisionError(
                `kubectl command timed out after ${timeout}ms: kubectl ${args.join(" ")}`
              )
            );
            return;
          }

          if (exceededBuffer) {
            if (allowFailure) {
              resolve("");
              return;
            }
            reject(
              new WorkspaceProvisionError(
                `kubectl command output exceeded max buffer (${maxBuffer} bytes): kubectl ${args.join(" ")}`
              )
            );
            return;
          }

          if (code === 0) {
            resolve(stdout.trim());
            return;
          }

          if (allowFailure) {
            resolve("");
            return;
          }

          reject(
            new WorkspaceProvisionError(
              stderr.trim().length > 0
                ? `kubectl command failed: ${stderr.trim()}`
                : `kubectl command failed with exit code ${code}: kubectl ${args.join(" ")}`
            )
          );
        });
      });

      if (typeof input === "string") {
        child.stdin.end(input);
      } else {
        child.stdin.end();
      }
    });
  }

  private formatDockerError(error: unknown): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.trim().length > 0
    ) {
      return `Docker command failed: ${error.stderr.trim()}`;
    }

    if (error instanceof Error && error.message.length > 0) {
      return `Docker command failed: ${error.message}`;
    }

    return "Docker command failed";
  }

  private formatKubectlError(error: unknown): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.trim().length > 0
    ) {
      return `kubectl command failed: ${error.stderr.trim()}`;
    }

    if (error instanceof Error && error.message.length > 0) {
      return `kubectl command failed: ${error.message}`;
    }

    return "kubectl command failed";
  }
}

function parseAssertions(stdout: string): AssertionResult[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = ASSERTION_LINE_PATTERN.exec(line);
      if (!match) {
        return null;
      }

      const [, checkId, status, rawWeight, explanation] = match;
      const parsedWeight = Number.parseInt(rawWeight, 10);

      return {
        checkId,
        passed: status === "PASS",
        weight: Number.isFinite(parsedWeight) ? parsedWeight : 0,
        explanation
      } satisfies AssertionResult;
    })
    .filter((assertion): assertion is AssertionResult => assertion !== null);
}

function shellEscape(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}
