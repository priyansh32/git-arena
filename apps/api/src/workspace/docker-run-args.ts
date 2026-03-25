import type { Session } from "@gitarena/shared";

import type { WorkspaceSpec } from "./spec.js";

export function buildWorkspaceContainerRunArgs(
  containerName: string,
  session: Session,
  spec: WorkspaceSpec
): string[] {
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
    `${spec.resources.pidsLimit}`
  ];

  if (spec.security.runtime) {
    args.push("--runtime", spec.security.runtime);
  }

  args.push(spec.image);

  return args;
}
