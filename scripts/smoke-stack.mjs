#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  let apiBase = process.env.GITARENA_API_BASE ?? "http://localhost:3001/api/v1";
  let containerPrefix = process.env.GITARENA_WORKSPACE_PREFIX ?? "gitarena-ws";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--api-base") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --api-base");
      }
      apiBase = value;
      index += 1;
      continue;
    }

    if (arg === "--container-prefix") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --container-prefix");
      }
      containerPrefix = value;
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node scripts/smoke-stack.mjs [--api-base <url>] [--container-prefix <name>]"
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apiBase: apiBase.replace(/\/$/, ""),
    containerPrefix
  };
}

async function requestJson(apiBase, path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, init);
  const bodyText = await response.text();
  let body = {};

  if (bodyText.length > 0) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { message: bodyText };
    }
  }

  return {
    status: response.status,
    body
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function terminateSession(apiBase, sessionId) {
  await requestJson(apiBase, `/sessions/${sessionId}`, { method: "DELETE" });
}

function workspaceContainerName(containerPrefix, sessionId) {
  return `${containerPrefix}-${sessionId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

async function isContainerRunning(containerName) {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format",
      "{{.State.Running}}",
      containerName
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function isWorkspaceSeeded(containerName) {
  try {
    const { stdout } = await execFileAsync("docker", [
      "exec",
      "-i",
      containerName,
      "sh",
      "-lc",
      "cd /workspace && git rev-parse --is-inside-work-tree"
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function main() {
  const { apiBase, containerPrefix } = parseArgs(process.argv.slice(2));
  const cleanupSessionIds = new Set();

  console.log(`[smoke] api=${apiBase}`);

  try {
    const ready = await requestJson(apiBase, "/health/ready");
    assert(ready.status === 200, `health check failed with status ${ready.status}`);

    const scenarios = await requestJson(apiBase, "/scenarios");
    assert(scenarios.status === 200, `list scenarios failed with status ${scenarios.status}`);

    const scenarioId = scenarios.body?.scenarios?.[0]?.id;
    assert(typeof scenarioId === "string" && scenarioId.length > 0, "No scenario found");
    console.log(`[smoke] scenario=${scenarioId}`);

    const firstCreate = await requestJson(apiBase, "/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId })
    });
    console.log(`[smoke] first_create_status=${firstCreate.status}`);

    let activeSessionId = firstCreate.body?.session?.id;

    if (firstCreate.status === 201) {
      assert(typeof activeSessionId === "string", "First create missing session id");
      cleanupSessionIds.add(activeSessionId);
    } else if (firstCreate.status === 409) {
      assert(typeof activeSessionId === "string", "409 create missing active session id");
      console.log(`[smoke] existing_session=${activeSessionId}`);
    } else {
      throw new Error(`Unexpected first create status ${firstCreate.status}`);
    }

    const secondCreate = await requestJson(apiBase, "/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId })
    });
    console.log(`[smoke] second_create_status=${secondCreate.status}`);
    assert(secondCreate.status === 409, "Second create should return 409");

    const deleted = await requestJson(apiBase, `/sessions/${activeSessionId}`, {
      method: "DELETE"
    });
    console.log(`[smoke] delete_status=${deleted.status}`);
    assert(deleted.status === 200, "Delete active session should return 200");
    cleanupSessionIds.delete(activeSessionId);

    const thirdCreate = await requestJson(apiBase, "/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId })
    });
    console.log(`[smoke] third_create_status=${thirdCreate.status}`);
    assert(thirdCreate.status === 201, "Third create should return 201");

    const thirdSessionId = thirdCreate.body?.session?.id;
    assert(typeof thirdSessionId === "string", "Third create missing session id");
    cleanupSessionIds.add(thirdSessionId);

    const containerName = workspaceContainerName(containerPrefix, thirdSessionId);
    const runningBeforeDelete = await isContainerRunning(containerName);
    console.log(`[smoke] workspace_container_running=${runningBeforeDelete}`);
    assert(runningBeforeDelete, "Workspace container did not start");

    const seededWorkspace = await isWorkspaceSeeded(containerName);
    console.log(`[smoke] workspace_seeded_git_repo=${seededWorkspace}`);
    assert(seededWorkspace, "Workspace did not contain a seeded git repository");

    const finalDelete = await requestJson(apiBase, `/sessions/${thirdSessionId}`, {
      method: "DELETE"
    });
    console.log(`[smoke] final_delete_status=${finalDelete.status}`);
    assert(finalDelete.status === 200, "Cleanup delete should return 200");
    cleanupSessionIds.delete(thirdSessionId);

    const runningAfterDelete = await isContainerRunning(containerName);
    console.log(`[smoke] workspace_container_after_delete=${runningAfterDelete}`);
    assert(!runningAfterDelete, "Workspace container was not removed");

    console.log("[smoke] ok");
  } finally {
    for (const sessionId of cleanupSessionIds) {
      try {
        await terminateSession(apiBase, sessionId);
      } catch {
        // Best effort cleanup to avoid leaking active sessions in local dev.
      }
    }
  }
}

main().catch((error) => {
  console.error(`[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
