export class WorkspaceProvisionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "WorkspaceProvisionError";
  }
}

export function formatDockerError(error: unknown): string {
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

export function formatKubectlError(error: unknown): string {
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
