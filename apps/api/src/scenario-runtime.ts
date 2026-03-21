import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ScenarioRuntime {
  seedScript: string;
  evaluatorScript: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const scenarioScriptsDir = resolve(moduleDir, "../scenarios");
const runtimeCache = new Map<string, ScenarioRuntime>();

export function getScenarioRuntime(scenarioId: string): ScenarioRuntime {
  if (!isValidScenarioId(scenarioId)) {
    throw new Error(`Invalid scenario id '${scenarioId}'`);
  }

  const cachedRuntime = runtimeCache.get(scenarioId);
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const runtime: ScenarioRuntime = {
    seedScript: readScript(`${scenarioId}/seed.sh`),
    evaluatorScript: readScript(`${scenarioId}/eval.sh`)
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

function isValidScenarioId(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}
