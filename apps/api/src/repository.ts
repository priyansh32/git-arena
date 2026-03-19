import { randomUUID } from "node:crypto";

import type { Scenario, Session } from "@gitarena/shared";
import { Pool, type PoolClient } from "pg";

import { defaultScenarios } from "./scenario-seed.js";

interface ScenarioRow {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Scenario["difficulty"];
  estimated_time_minutes: number;
  tags: string[];
  status: Scenario["status"];
}

interface SessionRow {
  id: string;
  user_id: string;
  scenario_id: string;
  status: Session["status"];
  started_at: Date;
  ws_url: string;
  ws_token: string;
  expires_at: Date;
}

function mapScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    objective: row.objective,
    difficulty: row.difficulty,
    estimatedTimeMinutes: row.estimated_time_minutes,
    tags: row.tags,
    status: row.status
  };
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    scenarioId: row.scenario_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    wsUrl: row.ws_url,
    wsToken: row.ws_token,
    expiresAt: row.expires_at.toISOString()
  };
}

export class Repository {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.createSchema(client);
      await this.seedScenarios(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPublishedScenarios(): Promise<Scenario[]> {
    const result = await this.pool.query<ScenarioRow>(
      `
      SELECT
        id,
        title,
        description,
        objective,
        difficulty,
        estimated_time_minutes,
        tags,
        status
      FROM scenarios
      WHERE status = 'published'
      ORDER BY title ASC
      `
    );

    return result.rows.map(mapScenario);
  }

  async getScenarioById(id: string): Promise<Scenario | null> {
    const result = await this.pool.query<ScenarioRow>(
      `
      SELECT
        id,
        title,
        description,
        objective,
        difficulty,
        estimated_time_minutes,
        tags,
        status
      FROM scenarios
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapScenario(result.rows[0]);
  }

  async createSession(userId: string, scenarioId: string): Promise<Session> {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);

    const insert: Session = {
      id: randomUUID(),
      userId,
      scenarioId,
      status: "active",
      startedAt: startedAt.toISOString(),
      wsUrl: `/ws/sessions/${scenarioId}`,
      wsToken: randomUUID(),
      expiresAt: expiresAt.toISOString()
    };

    const result = await this.pool.query<SessionRow>(
      `
      INSERT INTO sessions (
        id,
        user_id,
        scenario_id,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        user_id,
        scenario_id,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at
      `,
      [
        insert.id,
        insert.userId,
        insert.scenarioId,
        insert.status,
        insert.startedAt,
        insert.wsUrl,
        insert.wsToken,
        insert.expiresAt
      ]
    );

    return mapSession(result.rows[0]);
  }

  async getSessionById(id: string): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `
      SELECT
        id,
        user_id,
        scenario_id,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at
      FROM sessions
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapSession(result.rows[0]);
  }

  private async createSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        objective TEXT NOT NULL,
        difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
        estimated_time_minutes INTEGER NOT NULL CHECK (estimated_time_minutes > 0),
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL CHECK (status IN ('draft', 'testing', 'published', 'deprecated')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'submitted', 'evaluated', 'terminated')),
        started_at TIMESTAMPTZ NOT NULL,
        ws_url TEXT NOT NULL,
        ws_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS sessions_scenario_id_idx ON sessions (scenario_id)"
    );
  }

  private async seedScenarios(client: PoolClient): Promise<void> {
    for (const scenario of defaultScenarios) {
      await client.query(
        `
        INSERT INTO scenarios (
          id,
          title,
          description,
          objective,
          difficulty,
          estimated_time_minutes,
          tags,
          status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          objective = EXCLUDED.objective,
          difficulty = EXCLUDED.difficulty,
          estimated_time_minutes = EXCLUDED.estimated_time_minutes,
          tags = EXCLUDED.tags,
          status = EXCLUDED.status,
          updated_at = NOW()
        `,
        [
          scenario.id,
          scenario.title,
          scenario.description,
          scenario.objective,
          scenario.difficulty,
          scenario.estimatedTimeMinutes,
          JSON.stringify(scenario.tags),
          scenario.status
        ]
      );
    }
  }
}
