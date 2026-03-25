import type { Session } from "@gitarena/shared";

import type { WorkspaceSpec } from "./spec.js";

export function buildWorkspaceContainerRunArgs(
  containerName: string,
  session: Session,
  spec: WorkspaceSpec
): string[] {
  const envArgs = spec.env.flatMap((entry) => ["--env", `${entry.name}=${entry.value}`]);

  const args: string[] = [
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
    "--network",
    spec.security.network,
    "--user",
    spec.security.user,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    `${spec.resources.memoryMb}m`,
    "--memory-reservation",
    `${Math.floor(spec.resources.memoryMb / 2)}m`,
    "--memory-swap",
    `${spec.resources.memoryMb}m`,
    "--cpus",
    `${spec.resources.cpuMillicores / 1000}`,
    "--pids-limit",
    `${spec.resources.pidsLimit}`,
    "--health-cmd",
    spec.healthcheck.command,
    "--health-interval",
    `${spec.healthcheck.intervalSeconds}s`,
    "--health-timeout",
    `${spec.healthcheck.timeoutSeconds}s`,
    "--health-retries",
    `${spec.healthcheck.retries}`,
    "--health-start-period",
    `${spec.healthcheck.startPeriodSeconds}s`,
    ...envArgs,
    "-w",
    spec.workingDir
  ];

  if (spec.security.runtime) {
    args.push("--runtime", spec.security.runtime);
  }

  args.push(
    "--entrypoint",
    "sh",
    spec.image,
    "-lc",
    spec.initCommand
  );

  return args;
}
