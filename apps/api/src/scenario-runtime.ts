import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ScenarioRuntime {
  seedScript: string;
  evaluatorScript: string;
}

interface ScenarioRuntimeFileMap {
  seedPath: string;
  evaluatorPath: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const scenarioScriptsDir = resolve(moduleDir, "../scenarios");
const runtimeCache = new Map<string, ScenarioRuntime>();

const scenarioRuntimeFiles: Record<string, ScenarioRuntimeFileMap> = {
  "detached-head-recovery": {
    seedPath: "detached-head-recovery/seed.sh",
    evaluatorPath: "detached-head-recovery/eval.sh"
  },
  "interactive-rebase-cleanup": {
    seedPath: "interactive-rebase-cleanup/seed.sh",
    evaluatorPath: "interactive-rebase-cleanup/eval.sh"
  },
  "remote-divergence-resolution": {
    seedPath: "remote-divergence-resolution/seed.sh",
    evaluatorPath: "remote-divergence-resolution/eval.sh"
  }
};

export function getScenarioRuntime(scenarioId: string): ScenarioRuntime {
  const cachedRuntime = runtimeCache.get(scenarioId);
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const runtimeFiles = scenarioRuntimeFiles[scenarioId];
  if (!runtimeFiles) {
    throw new Error(`No runtime definition found for scenario '${scenarioId}'`);
  }

  const runtime: ScenarioRuntime = {
    seedScript: readScript(runtimeFiles.seedPath),
    evaluatorScript: readScript(runtimeFiles.evaluatorPath)
  };

  runtimeCache.set(scenarioId, runtime);
  return runtime;
}

function readScript(relativePath: string): string {
  const absolutePath = resolve(scenarioScriptsDir, relativePath);

  try {
    return readFileSync(absolutePath, "utf8").trimEnd();
  } catch (error) {
    throw new Error(
      `Unable to load scenario script '${relativePath}' from '${absolutePath}': ${formatError(error)}`
    );
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
