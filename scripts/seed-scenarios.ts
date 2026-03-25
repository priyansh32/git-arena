import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";

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
  workspaceType: string;
}

interface ScenarioInput {
  id: string;
  metadata: ScenarioMetadata;
  seedScript: string;
  evaluatorScript: string;
  checksum: string;
}

interface ScenarioRow {
  id: string;
}

interface LatestRevisionRow {
  version: number;
  checksum: string;
}

function usage(): void {
  console.log(`Usage:
  npx tsx scripts/seed-scenarios.ts [--reset]

Options:
  --reset   Delete attempts, sessions, scenario_revisions, and scenarios before seeding.
`);
}

function parseArgs(argv: string[]): { reset: boolean } {
  let reset = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--reset") {
      reset = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { reset };
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

    const workspaceType = typeof parsed.workspaceType === "string" && parsed.workspaceType.trim().length > 0
      ? parsed.workspaceType.trim()
      : "git";

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
      status: parseStatus(parsed.status, id),
      workspaceType
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

  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://gitarena:gitarena@localhost:5432/gitarena";
  const client = new Client({ connectionString: databaseUrl });

  let created = 0;
  let revised = 0;
  let unchanged = 0;

  await client.connect();
  try {
    await client.query("BEGIN");

    if (args.reset) {
      await client.query("DELETE FROM attempts");
      await client.query("DELETE FROM sessions");
      await client.query("DELETE FROM scenario_revisions");
      await client.query("DELETE FROM scenarios");
    }

    for (const scenario of scenarios) {
      const existingResult = await client.query<ScenarioRow>(
        `
        SELECT id
        FROM scenarios
        WHERE id = $1
        LIMIT 1
        `,
        [scenario.id]
      );

      if (!existingResult.rowCount) {
        await client.query(
          `
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
            workspace_type,
            active_revision,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, 1, NOW(), NOW())
          `,
          [
            scenario.id,
            scenario.metadata.title,
            scenario.metadata.description,
            scenario.metadata.objective,
            scenario.metadata.difficulty,
            scenario.metadata.commonality,
            scenario.metadata.estimatedTimeMinutes,
            scenario.metadata.timeLimitSeconds,
            JSON.stringify(scenario.metadata.tags),
            JSON.stringify(scenario.metadata.hints),
            scenario.metadata.status,
            scenario.metadata.workspaceType
          ]
        );

        await client.query(
          `
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
          VALUES ($1, 1, $2, $3::jsonb, $4, $5, $6, $7, NOW())
          `,
          [
            scenario.id,
            scenario.metadata.objective,
            JSON.stringify(scenario.metadata.hints),
            scenario.seedScript,
            scenario.evaluatorScript,
            scenario.metadata.timeLimitSeconds,
            scenario.checksum
          ]
        );

        created += 1;
        continue;
      }

      const latestRevisionResult = await client.query<LatestRevisionRow>(
        `
        SELECT
          version,
          checksum
        FROM scenario_revisions
        WHERE scenario_id = $1
        ORDER BY version DESC
        LIMIT 1
        `,
        [scenario.id]
      );

      const latestRevision = latestRevisionResult.rows[0];
      const shouldCreateRevision =
        !latestRevision || latestRevision.checksum !== scenario.checksum;

      if (shouldCreateRevision) {
        const nextVersion = latestRevision ? latestRevision.version + 1 : 1;
        await client.query(
          `
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
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW())
          `,
          [
            scenario.id,
            nextVersion,
            scenario.metadata.objective,
            JSON.stringify(scenario.metadata.hints),
            scenario.seedScript,
            scenario.evaluatorScript,
            scenario.metadata.timeLimitSeconds,
            scenario.checksum
          ]
        );

        await client.query(
          `
          UPDATE scenarios
          SET title = $2,
              description = $3,
              objective = $4,
              difficulty = $5,
              commonality = $6,
              estimated_time_minutes = $7,
              time_limit_seconds = $8,
              tags = $9::jsonb,
              hints = $10::jsonb,
              status = $11,
              workspace_type = $12,
              active_revision = $13,
              updated_at = NOW()
          WHERE id = $1
          `,
          [
            scenario.id,
            scenario.metadata.title,
            scenario.metadata.description,
            scenario.metadata.objective,
            scenario.metadata.difficulty,
            scenario.metadata.commonality,
            scenario.metadata.estimatedTimeMinutes,
            scenario.metadata.timeLimitSeconds,
            JSON.stringify(scenario.metadata.tags),
            JSON.stringify(scenario.metadata.hints),
            scenario.metadata.status,
            scenario.metadata.workspaceType,
            nextVersion
          ]
        );

        revised += 1;
        continue;
      }

      await client.query(
        `
        UPDATE scenarios
        SET title = $2,
            description = $3,
            objective = $4,
            difficulty = $5,
            commonality = $6,
            estimated_time_minutes = $7,
            time_limit_seconds = $8,
            tags = $9::jsonb,
            hints = $10::jsonb,
            status = $11,
            workspace_type = $12,
            active_revision = $13,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          scenario.id,
          scenario.metadata.title,
          scenario.metadata.description,
          scenario.metadata.objective,
          scenario.metadata.difficulty,
          scenario.metadata.commonality,
          scenario.metadata.estimatedTimeMinutes,
          scenario.metadata.timeLimitSeconds,
          JSON.stringify(scenario.metadata.tags),
          JSON.stringify(scenario.metadata.hints),
          scenario.metadata.status,
          scenario.metadata.workspaceType,
          latestRevision.version
        ]
      );

      unchanged += 1;
    }

    await client.query("COMMIT");

    console.log(
      [
        `seeded_total=${scenarios.length}`,
        `created=${created}`,
        `revised=${revised}`,
        `unchanged=${unchanged}`,
        `reset=${args.reset}`
      ].join(" ")
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
