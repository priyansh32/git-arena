import assert from "node:assert/strict";
import test from "node:test";

import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
import { WorkspaceManager } from "./workspace-manager.js";

const POLICY_ENV_ALLOWLIST = [
  "HOME=/home/gituser",
  "SHELL=/bin/bash",
  "TERM=xterm-256color",
  "GIT_AUTHOR_NAME=Git Arena",
  "GIT_AUTHOR_EMAIL=user@gitarena.dev",
  "GIT_COMMITTER_NAME=Git Arena",
  "GIT_COMMITTER_EMAIL=user@gitarena.dev",
  "LANG=en_US.UTF-8"
];

function makeWorkspaceConfig(): WorkspaceConfig {
  return {
    provider: "docker",
    image: "gitarena-base:2.43.7-alpine3.19-v1",
    rootDir: "/workspace",
    shell: "/bin/bash",
    containerPrefix: "gitarena-ws",
    initCommand: "mkdir -p /workspace && cd /workspace && exec tail -f /dev/null",
    kubernetes: {
      namespace: "gitarena-sessions",
      runtimeClassName: "gvisor",
      imagePullPolicy: "IfNotPresent",
      podReadyTimeoutSeconds: 240
    }
  };
}

function makeSession(): Session {
  return {
    id: "session-hardening-check",
    userId: "user-hardening-check",
    scenarioId: "detached-head-recovery",
    status: "active",
    startedAt: new Date().toISOString(),
    wsUrl: "ws://localhost/ws/sessions/session-hardening-check",
    wsToken: "token",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    hintCount: 0
  };
}

function expectFlagValue(args: string[], flag: string, value: string): void {
  const index = args.indexOf(flag);
  assert.notEqual(index, -1, `missing flag: ${flag}`);
  assert.equal(args[index + 1], value, `unexpected value for ${flag}`);
}

test("createWorkspaceContainer applies docker hardening flags", async () => {
  const manager = new WorkspaceManager(makeWorkspaceConfig()) as unknown as {
    createWorkspaceContainer: (containerName: string, session: Session) => Promise<void>;
    runDocker: (args: string[]) => Promise<string>;
  };

  let capturedArgs: string[] | null = null;
  manager.runDocker = async (args: string[]) => {
    capturedArgs = args;
    return "";
  };

  await manager.createWorkspaceContainer("gitarena-ws-session-hardening-check", makeSession());

  if (!capturedArgs) {
    assert.fail("docker run args were not captured");
  }
  const args: string[] = capturedArgs;

  assert.equal(args[0], "run");
  assert.equal(args[1], "-d");
  assert.ok(args.includes("--rm"));

  expectFlagValue(args, "--network", "none");
  expectFlagValue(args, "--user", "1000:1000");
  expectFlagValue(args, "--cap-drop", "ALL");
  expectFlagValue(args, "--security-opt", "no-new-privileges");
  expectFlagValue(args, "--memory", "256m");
  expectFlagValue(args, "--memory-reservation", "128m");
  expectFlagValue(args, "--memory-swap", "256m");
  expectFlagValue(args, "--cpus", "0.5");
  expectFlagValue(args, "--pids-limit", "100");

  const envValues: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--env") {
      continue;
    }
    envValues.push(args[i + 1]);
  }
  assert.equal(envValues.length, POLICY_ENV_ALLOWLIST.length, "unexpected count of --env flags");
  for (const expectedEnv of POLICY_ENV_ALLOWLIST) {
    assert.ok(envValues.includes(expectedEnv), `missing policy env value: ${expectedEnv}`);
  }
});
