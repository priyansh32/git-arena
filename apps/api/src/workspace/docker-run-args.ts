import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "../config.js";
import { POLICY_ENV_ALLOWLIST } from "./constants.js";

export function buildWorkspaceContainerRunArgs(
  containerName: string,
  session: Session,
  config: WorkspaceConfig
): string[] {
  const policyEnvArgs = POLICY_ENV_ALLOWLIST.flatMap((entry) => ["--env", `${entry.name}=${entry.value}`]);

  return [
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
    "none",
    "--user",
    "1000:1000",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "256m",
    "--memory-reservation",
    "128m",
    "--memory-swap",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "100",
    ...policyEnvArgs,
    "-w",
    config.rootDir,
    "--entrypoint",
    "sh",
    config.image,
    "-lc",
    config.initCommand
  ];
}
