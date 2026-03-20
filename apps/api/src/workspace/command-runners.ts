import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import {
  WorkspaceProvisionError,
  formatDockerError,
  formatKubectlError
} from "./errors.js";

const execFileAsync = promisify(execFile);

interface RunDockerOptions {
  allowFailure?: boolean;
  timeout?: number;
  maxBuffer?: number;
}

interface RunKubectlOptions {
  allowFailure?: boolean;
  input?: string;
  timeout?: number;
  maxBuffer?: number;
}

export async function runDockerCommand(
  args: string[],
  options: RunDockerOptions = {}
): Promise<string> {
  const {
    allowFailure = false,
    timeout = 30_000,
    maxBuffer = 1024 * 1024
  } = options;

  try {
    const { stdout } = await execFileAsync("docker", args, {
      timeout,
      maxBuffer
    });

    return stdout.trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const message = formatDockerError(error);
    throw new WorkspaceProvisionError(message, error);
  }
}

export async function runKubectlCommand(
  args: string[],
  options: RunKubectlOptions = {}
): Promise<string> {
  const {
    allowFailure = false,
    input,
    timeout = 30_000,
    maxBuffer = 1024 * 1024
  } = options;

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
        reject(new WorkspaceProvisionError(formatKubectlError(error), error));
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

export async function runScriptInDockerContainer(
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
    const message = formatDockerError(error);
    throw new WorkspaceProvisionError(message, error);
  }
}

export async function runScriptInKubernetesPod(
  namespace: string,
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
        namespace,
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
    const message = formatKubectlError(error);
    throw new WorkspaceProvisionError(message, error);
  }
}
