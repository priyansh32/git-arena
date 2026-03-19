import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";

import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";

const execFileAsync = promisify(execFile);

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

  async ensureWorkspace(session: Session): Promise<void> {
    const containerName = this.getContainerName(session.id);
    const running = await this.isContainerRunning(containerName);

    if (running) {
      return;
    }

    await this.removeWorkspaceByName(containerName);
    await this.createWorkspaceContainer(containerName, session);
  }

  async stopWorkspace(sessionId: string): Promise<void> {
    await this.removeWorkspaceByName(this.getContainerName(sessionId));
  }

  openTerminal(sessionId: string): ChildProcessWithoutNullStreams {
    const containerName = this.getContainerName(sessionId);

    return spawn(
      "docker",
      ["exec", "-i", containerName, this.config.shell, "-i"],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          TERM: "xterm-256color"
        }
      }
    );
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
}
