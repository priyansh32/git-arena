import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Difficulty = "beginner" | "intermediate" | "advanced";
type ScenarioStatus = "draft" | "testing" | "published" | "deprecated";
type ScenarioCommonality = "very_common" | "common" | "occasional" | "rare";

interface ScenarioMetadata {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Difficulty;
  commonality: ScenarioCommonality;
  estimatedTimeMinutes: number;
  timeLimitSeconds: number;
  tags: string[];
  hints: string[];
  status: ScenarioStatus;
}

interface ScenarioInput {
  id: string;
  metadata: ScenarioMetadata;
  seedScript: string;
  evaluatorScript: string;
  checksum: string;
}

interface CliArgs {
  outPath?: string;
}

function usage(): void {
  console.log(`Usage:
  npx tsx scripts/generate-scenarios-upsert-sql.ts [--out <file>]

Options:
  --out <file>   Write SQL to file (defaults to stdout)
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--out") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --out");
      }
      args.outPath = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseDifficulty(value: unknown, scenarioId: string): Difficulty {
  if (value === "beginner" || value === "intermediate" || value === "advanced") {
    return value;
  }
  throw new Error(`Invalid difficulty in ${scenarioId}: ${String(value)}`);
}

function parseStatus(value: unknown, scenarioId: string): ScenarioStatus {
  if (
    value === "draft" ||
    value === "testing" ||
    value === "published" ||
    value === "deprecated"
  ) {
    return value;
  }
  throw new Error(`Invalid status in ${scenarioId}: ${String(value)}`);
}

function parseCommonality(value: unknown, scenarioId: string): ScenarioCommonality {
  if (
    value === "very_common" ||
    value === "common" ||
    value === "occasional" ||
    value === "rare"
  ) {
    return value;
  }

  throw new Error(
    `Invalid commonality in ${scenarioId}: ${String(value)} (expected very_common/common/occasional/rare)`
  );
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildChecksum(input: {
  seedScript: string;
  evaluatorScript: string;
  objective: string;
  hints: string[];
  timeLimitSeconds: number;
}): string {
  const payload = JSON.stringify({
    seedScript: input.seedScript.trim(),
    evaluatorScript: input.evaluatorScript.trim(),
    objective: input.objective.trim(),
    hints: input.hints,
    timeLimitSeconds: input.timeLimitSeconds
  });

  return createHash("sha256").update(payload).digest("hex");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function loadScenarioInputs(rootDir: string): Promise<ScenarioInput[]> {
  const dirEntries = await readdir(rootDir, { withFileTypes: true });
  const scenarioIds = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const scenarios: ScenarioInput[] = [];
  for (const scenarioId of scenarioIds) {
    const scenarioDir = resolve(rootDir, scenarioId);
    const metadataPath = resolve(scenarioDir, "metadata.json");
    const seedPath = resolve(scenarioDir, "seed.sh");
    const evalPath = resolve(scenarioDir, "eval.sh");

    const [metadataRaw, seedScriptRaw, evaluatorScriptRaw] = await Promise.all([
      readFile(metadataPath, "utf8"),
      readFile(seedPath, "utf8"),
      readFile(evalPath, "utf8")
    ]);

    const parsed = JSON.parse(metadataRaw) as Partial<ScenarioMetadata>;
    const id = String(parsed.id ?? "").trim();
    if (!id) {
      throw new Error(`Scenario metadata missing id in ${metadataPath}`);
    }
    if (id !== scenarioId) {
      throw new Error(
        `Scenario directory '${scenarioId}' and metadata id '${id}' do not match`
      );
    }

    const title = String(parsed.title ?? "").trim();
    const description = String(parsed.description ?? "").trim();
    const objective = String(parsed.objective ?? "").trim();
    const estimatedTimeMinutes = Number(parsed.estimatedTimeMinutes);
    const timeLimitSeconds = Math.max(60, Number(parsed.timeLimitSeconds));

    if (!title || !description || !objective) {
      throw new Error(`Missing title/description/objective for ${id}`);
    }
    if (!Number.isFinite(estimatedTimeMinutes) || estimatedTimeMinutes <= 0) {
      throw new Error(`Invalid estimatedTimeMinutes for ${id}`);
    }
    if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds <= 0) {
      throw new Error(`Invalid timeLimitSeconds for ${id}`);
    }

    const metadata: ScenarioMetadata = {
      id,
      title,
      description,
      objective,
      difficulty: parseDifficulty(parsed.difficulty, id),
      commonality: parseCommonality(parsed.commonality, id),
      estimatedTimeMinutes,
      timeLimitSeconds,
      tags: parseStringArray(parsed.tags),
      hints: parseStringArray(parsed.hints),
      status: parseStatus(parsed.status, id)
    };

    const seedScript = seedScriptRaw.trimEnd();
    const evaluatorScript = evaluatorScriptRaw.trimEnd();
    const checksum = buildChecksum({
      seedScript,
      evaluatorScript,
      objective: metadata.objective,
      hints: metadata.hints,
      timeLimitSeconds: metadata.timeLimitSeconds
    });

    scenarios.push({
      id,
      metadata,
      seedScript,
      evaluatorScript,
      checksum
    });
  }

  return scenarios;
}

function renderScenarioSql(scenario: ScenarioInput): string {
  const tagsJson = JSON.stringify(scenario.metadata.tags);
  const hintsJson = JSON.stringify(scenario.metadata.hints);

  return `
-- scenario: ${scenario.id}
INSERT INTO scenarios (
  id,
  title,
  description,
  objective,
  difficulty,
  commonality,
  estimated_time_minutes,
  time_limit_seconds,
  tags,
  hints,
  status,
  active_revision,
  created_at,
  updated_at
)
VALUES (
  ${sqlString(scenario.id)},
  ${sqlString(scenario.metadata.title)},
  ${sqlString(scenario.metadata.description)},
  ${sqlString(scenario.metadata.objective)},
  ${sqlString(scenario.metadata.difficulty)},
  ${sqlString(scenario.metadata.commonality)},
  ${scenario.metadata.estimatedTimeMinutes},
  ${scenario.metadata.timeLimitSeconds},
  ${sqlString(tagsJson)}::jsonb,
  ${sqlString(hintsJson)}::jsonb,
  ${sqlString(scenario.metadata.status)},
  1,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    objective = EXCLUDED.objective,
    difficulty = EXCLUDED.difficulty,
    commonality = EXCLUDED.commonality,
    estimated_time_minutes = EXCLUDED.estimated_time_minutes,
    time_limit_seconds = EXCLUDED.time_limit_seconds,
    tags = EXCLUDED.tags,
    hints = EXCLUDED.hints,
    status = EXCLUDED.status,
    updated_at = NOW();

WITH latest AS (
  SELECT version, checksum
  FROM scenario_revisions
  WHERE scenario_id = ${sqlString(scenario.id)}
  ORDER BY version DESC
  LIMIT 1
),
inserted_revision AS (
  INSERT INTO scenario_revisions (
    scenario_id,
    version,
    objective,
    hints,
    seed_script,
    evaluator_script,
    time_limit_seconds,
    checksum,
    created_at
  )
  SELECT
    ${sqlString(scenario.id)},
    COALESCE((SELECT version FROM latest), 0) + 1,
    ${sqlString(scenario.metadata.objective)},
    ${sqlString(hintsJson)}::jsonb,
    ${sqlString(scenario.seedScript)},
    ${sqlString(scenario.evaluatorScript)},
    ${scenario.metadata.timeLimitSeconds},
    ${sqlString(scenario.checksum)},
    NOW()
  WHERE COALESCE((SELECT checksum FROM latest), '') <> ${sqlString(scenario.checksum)}
  RETURNING version
)
UPDATE scenarios
SET objective = ${sqlString(scenario.metadata.objective)},
    hints = ${sqlString(hintsJson)}::jsonb,
    time_limit_seconds = ${scenario.metadata.timeLimitSeconds},
    active_revision = COALESCE(
      (SELECT version FROM inserted_revision),
      (SELECT version FROM latest),
      active_revision
    ),
    updated_at = NOW()
WHERE id = ${sqlString(scenario.id)};
`.trim();
}

function renderSqlScript(scenarios: ScenarioInput[]): string {
  const header = [
    "-- Generated by scripts/generate-scenarios-upsert-sql.ts",
    `-- Generated at: ${new Date().toISOString()}`,
    "-- Applies scenario metadata upserts and creates new immutable revisions when checksum changes.",
    "BEGIN;"
  ].join("\n");

  const body = scenarios.map((scenario) => renderScenarioSql(scenario)).join("\n\n");

  return `${header}\n\n${body}\n\nCOMMIT;\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scenariosRoot = resolve(process.cwd(), "scenarios");
  if (!existsSync(scenariosRoot)) {
    throw new Error(`Missing scenarios directory: ${scenariosRoot}`);
  }

  const scenarios = await loadScenarioInputs(scenariosRoot);
  if (scenarios.length === 0) {
    throw new Error(`No scenarios found in ${scenariosRoot}`);
  }

  const sql = renderSqlScript(scenarios);

  if (args.outPath) {
    const outputPath = resolve(process.cwd(), args.outPath);
    await writeFile(outputPath, sql, "utf8");
    console.error(`Wrote SQL for ${scenarios.length} scenarios to ${outputPath}`);
    return;
  }

  process.stdout.write(sql);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
