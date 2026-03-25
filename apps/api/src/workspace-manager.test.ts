import assert from "node:assert/strict";
import test from "node:test";

import type { Session } from "@gitarena/shared";

import type { WorkspaceConfig } from "./config.js";
import { DockerWorkspaceProvider } from "./workspace/docker-provider.js";
import { buildDefaultWorkspaceSpec, type WorkspaceSpec } from "./workspace/spec.js";

function makeWorkspaceConfig(): WorkspaceConfig {
  return {
    provider: "docker",
    containerPrefix: "gitarena-ws",
    kubernetes: {
      namespace: "gitarena-sessions",
      runtimeClassName: "gvisor",
      imagePullPolicy: "IfNotPresent",
      podReadyTimeoutSeconds: 240
    }
  };
}

function makeWorkspaceSpec(): WorkspaceSpec {
  return buildDefaultWorkspaceSpec();
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
  const spec = makeWorkspaceSpec();
  const provider = new DockerWorkspaceProvider(makeWorkspaceConfig(), spec) as unknown as {
    createContainer: (containerName: string, session: Session) => Promise<void>;
    runDocker: (args: string[]) => Promise<string>;
  };

  let capturedArgs: string[] | null = null;
  provider.runDocker = async (args: string[]) => {
    capturedArgs = args;
    return "";
  };

  await provider.createContainer("gitarena-ws-session-hardening-check", makeSession());

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
  expectFlagValue(args, "--health-cmd", "test -d /workspace && test -w /workspace");
  expectFlagValue(args, "--health-interval", "10s");
  expectFlagValue(args, "--health-timeout", "2s");
  expectFlagValue(args, "--health-retries", "3");
  expectFlagValue(args, "--health-start-period", "10s");

  const expectedEnvValues = spec.env.map((e) => `${e.name}=${e.value}`);
  const envValues: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--env") {
      continue;
    }
    envValues.push(args[i + 1]);
  }
  assert.equal(envValues.length, expectedEnvValues.length, "unexpected count of --env flags");
  for (const expectedEnv of expectedEnvValues) {
    assert.ok(envValues.includes(expectedEnv), `missing policy env value: ${expectedEnv}`);
  }
});
