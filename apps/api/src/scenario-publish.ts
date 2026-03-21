import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { cwd, exit } from "node:process";

import type { Scenario } from "@gitarena/shared";

import {
  type ScenarioPublishMetadata,
  Repository
} from "./repository.js";
import { defaultScenarios } from "./scenario-seed.js";

interface CliOptions {
  scenarioId: string;
  scenarioDir: string;
  metadata?: ScenarioPublishMetadata;
}

function printUsage(): void {
  console.log(`Usage:
  npm run scenario:publish -w @gitarena/api -- --id <scenario-id> [--dir <path>]
    [--title <text> --description <text> --objective <text>
     --difficulty <beginner|intermediate|advanced>
     --commonality <very_common|common|occasional|rare>
     --estimated-time-minutes <int> --time-limit-seconds <int>
     --status <draft|testing|published|deprecated>
     --tag <value> (repeatable) --hint <value> (repeatable)]

Examples:
  npm run scenario:publish -w @gitarena/api -- --id detached-head-recovery
  npm run scenario:publish -w @gitarena/api -- --id my-scenario --dir ./apps/api/scenarios/my-scenario \\
    --title "My Scenario" --description "..." --objective "..." \\
    --difficulty beginner --commonality common --estimated-time-minutes 20 --time-limit-seconds 1200 \\
    --status testing --tag git --hint "start with git status"
`);
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDifficulty(value: string): Scenario["difficulty"] {
  if (value === "beginner" || value === "intermediate" || value === "advanced") {
    return value;
  }
  throw new Error(`--difficulty must be one of: beginner, intermediate, advanced`);
}

function parseCommonality(value: string): Scenario["commonality"] {
  if (
    value === "very_common" ||
    value === "common" ||
    value === "occasional" ||
    value === "rare"
  ) {
    return value;
  }
  throw new Error(`--commonality must be one of: very_common, common, occasional, rare`);
}

function parseStatus(value: string): Scenario["status"] {
  if (value === "draft" || value === "testing" || value === "published" || value === "deprecated") {
    return value;
  }
  throw new Error(`--status must be one of: draft, testing, published, deprecated`);
}

function isReadableDir(pathValue: string): Promise<boolean> {
  return access(pathValue, fsConstants.R_OK)
    .then(() => true)
    .catch(() => false);
}

async function resolveScenarioDir(scenarioId: string, explicitDir?: string): Promise<string> {
  if (explicitDir) {
    return resolve(cwd(), explicitDir);
  }

  const candidates = [
    resolve(cwd(), "apps/api/scenarios", scenarioId),
    resolve(cwd(), "scenarios", scenarioId)
  ];

  for (const candidate of candidates) {
    if (await isReadableDir(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

async function parseArgs(argv: string[]): Promise<CliOptions> {
  let scenarioId: string | undefined;
  let explicitDir: string | undefined;
  let title: string | undefined;
  let description: string | undefined;
  let objective: string | undefined;
  let difficulty: Scenario["difficulty"] | undefined;
  let commonality: Scenario["commonality"] | undefined;
  let estimatedTimeMinutes: number | undefined;
  let timeLimitSeconds: number | undefined;
  let status: Scenario["status"] | undefined;
  const tags: string[] = [];
  const hints: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      exit(0);
    }

    if (!next && arg.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--id") {
      scenarioId = next;
      index += 1;
      continue;
    }
    if (arg === "--dir") {
      explicitDir = next;
      index += 1;
      continue;
    }
    if (arg === "--title") {
      title = next;
      index += 1;
      continue;
    }
    if (arg === "--description") {
      description = next;
      index += 1;
      continue;
    }
    if (arg === "--objective") {
      objective = next;
      index += 1;
      continue;
    }
    if (arg === "--difficulty") {
      difficulty = parseDifficulty(next);
      index += 1;
      continue;
    }
    if (arg === "--commonality") {
      commonality = parseCommonality(next);
      index += 1;
      continue;
    }
    if (arg === "--estimated-time-minutes") {
      estimatedTimeMinutes = parsePositiveInt(next, "--estimated-time-minutes");
      index += 1;
      continue;
    }
    if (arg === "--time-limit-seconds") {
      timeLimitSeconds = parsePositiveInt(next, "--time-limit-seconds");
      index += 1;
      continue;
    }
    if (arg === "--status") {
      status = parseStatus(next);
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      const value = next.trim();
      if (value.length > 0) {
        tags.push(value);
      }
      index += 1;
      continue;
    }
    if (arg === "--hint") {
      const value = next.trim();
      if (value.length > 0) {
        hints.push(value);
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!scenarioId || scenarioId.trim().length === 0) {
    throw new Error(`--id is required`);
  }

  const metadataFlagsUsed =
    title !== undefined ||
    description !== undefined ||
      objective !== undefined ||
      difficulty !== undefined ||
      commonality !== undefined ||
      estimatedTimeMinutes !== undefined ||
    timeLimitSeconds !== undefined ||
    status !== undefined ||
    tags.length > 0 ||
    hints.length > 0;

  let metadata: ScenarioPublishMetadata | undefined;
  if (metadataFlagsUsed) {
    if (
      !title ||
      !description ||
      !objective ||
      !difficulty ||
      !commonality ||
      estimatedTimeMinutes === undefined ||
      timeLimitSeconds === undefined ||
      !status
    ) {
      throw new Error(
        "Partial metadata provided. For metadata override, provide title/description/objective/difficulty/commonality/estimated-time-minutes/time-limit-seconds/status."
      );
    }

    metadata = {
      title: title.trim(),
      description: description.trim(),
      objective: objective.trim(),
      difficulty,
      commonality,
      estimatedTimeMinutes,
      timeLimitSeconds,
      status,
      tags,
      hints
    };
  }

  return {
    scenarioId: scenarioId.trim(),
    scenarioDir: await resolveScenarioDir(scenarioId.trim(), explicitDir),
    metadata
  };
}

async function readScenarioScripts(
  scenarioDir: string
): Promise<{ seedScript: string; evaluatorScript: string }> {
  const seedPath = resolve(scenarioDir, "seed.sh");
  const evalPath = resolve(scenarioDir, "eval.sh");
  const [seedScriptRaw, evaluatorScriptRaw] = await Promise.all([
    readFile(seedPath, "utf8"),
    readFile(evalPath, "utf8")
  ]);

  return {
    seedScript: seedScriptRaw.trimEnd(),
    evaluatorScript: evaluatorScriptRaw.trimEnd()
  };
}

function defaultMetadataForScenario(scenarioId: string): ScenarioPublishMetadata | undefined {
  const match = defaultScenarios.find((scenario) => scenario.id === scenarioId);
  if (!match) {
    return undefined;
  }

  return {
    title: match.title,
    description: match.description,
    objective: match.objective,
    difficulty: match.difficulty,
    commonality: match.commonality,
    estimatedTimeMinutes: match.estimatedTimeMinutes,
    timeLimitSeconds: Math.max(60, match.estimatedTimeMinutes * 60),
    tags: match.tags,
    hints: match.hints,
    status: match.status
  };
}

async function main(): Promise<void> {
  const options = await parseArgs(process.argv.slice(2));
  const scripts = await readScenarioScripts(options.scenarioDir);
  const repository = new Repository(
    process.env.DATABASE_URL ?? "postgres://gitarena:gitarena@localhost:5432/gitarena"
  );

  try {
    await repository.init();
    const existingScenario = await repository.getScenarioById(options.scenarioId);
    const metadata =
      options.metadata ??
      (existingScenario ? undefined : defaultMetadataForScenario(options.scenarioId));

    if (!existingScenario && !metadata) {
      throw new Error(
        `Scenario '${options.scenarioId}' does not exist. Provide full metadata flags to create it.`
      );
    }

    const published = await repository.publishScenarioRevision({
      scenarioId: options.scenarioId,
      seedScript: scripts.seedScript,
      evaluatorScript: scripts.evaluatorScript,
      metadata
    });

    console.log(
      [
        `scenario_id=${published.scenarioId}`,
        `version=${published.version}`,
        `checksum=${published.checksum}`,
        `created_revision=${published.created}`
      ].join(" ")
    );
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  printUsage();
  process.exit(1);
});
