import { randomUUID } from "node:crypto";

import type {
  AssertionResult,
  Attempt,
  Scenario,
  Session,
  UserProfile
} from "@gitarena/shared";
import { Pool, type PoolClient } from "pg";

import { evaluateSubmission } from "./evaluation.js";
import { defaultScenarios } from "./scenario-seed.js";

interface ScenarioRow {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Scenario["difficulty"];
  estimated_time_minutes: number;
  tags: unknown;
  hints: unknown;
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
  hint_count: number;
}

interface AttemptRow {
  id: string;
  session_id: string;
  user_id: string;
  scenario_id: string;
  score: number;
  base_score: number;
  time_bonus: number;
  hint_penalty: number;
  passed: boolean;
  assertion_results: unknown;
  evaluated_at: Date;
}

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AuthSessionJoinRow {
  user_id: string;
  expires_at: Date;
  session_id: string;
  csrf_token: string;
  google_sub: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AuthenticatedSession {
  user: UserProfile;
  csrfToken: string;
}

interface SessionScenarioRow extends SessionRow {
  scenario_objective: string;
  scenario_hints: unknown;
  scenario_estimated_time_minutes: number;
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

function parseAssertions(value: unknown): AssertionResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Partial<AssertionResult>;

      if (
        typeof record.checkId !== "string" ||
        typeof record.passed !== "boolean" ||
        typeof record.explanation !== "string" ||
        typeof record.weight !== "number"
      ) {
        return null;
      }

      return {
        checkId: record.checkId,
        passed: record.passed,
        explanation: record.explanation,
        weight: record.weight
      } satisfies AssertionResult;
    })
    .filter((item): item is AssertionResult => item !== null);
}

function mapScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    objective: row.objective,
    difficulty: row.difficulty,
    estimatedTimeMinutes: row.estimated_time_minutes,
    tags: parseStringArray(row.tags),
    hints: parseStringArray(row.hints),
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
    expiresAt: row.expires_at.toISOString(),
    hintCount: row.hint_count
  };
}

function mapAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    scenarioId: row.scenario_id,
    score: row.score,
    baseScore: row.base_score,
    timeBonus: row.time_bonus,
    hintPenalty: row.hint_penalty,
    passed: row.passed,
    assertions: parseAssertions(row.assertion_results),
    evaluatedAt: row.evaluated_at.toISOString()
  };
}

function mapUserProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function buildHint(row: SessionScenarioRow): string {
  const hints = parseStringArray(row.scenario_hints);
  const nextHintIndex = Math.max(0, row.hint_count - 1);

  if (hints.length > 0) {
    const boundedIndex = Math.min(nextHintIndex, hints.length - 1);
    return hints[boundedIndex];
  }

  return `Keep changes minimal and verify objective: ${row.scenario_objective}`;
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
      await this.normalizeActiveSessions(client);
      await this.ensureConstraints(client);
      await this.purgeExpiredAuthSessions(client);
      await this.seedScenarios(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertGoogleUser(input: {
    googleSub: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<UserProfile> {
    const result = await this.pool.query<UserRow>(
      `
      INSERT INTO users (
        id,
        google_sub,
        email,
        display_name,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (google_sub)
      DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING
        id,
        google_sub,
        email,
        display_name,
        avatar_url,
        created_at,
        updated_at
      `,
      [
        randomUUID(),
        input.googleSub,
        input.email.toLowerCase(),
        input.displayName,
        input.avatarUrl
      ]
    );

    return mapUserProfile(result.rows[0]);
  }

  async getAuthSessionByTokenHash(
    tokenHash: string
  ): Promise<AuthenticatedSession | null> {
    const result = await this.pool.query<AuthSessionJoinRow>(
      `
      WITH active_session AS (
        UPDATE auth_sessions
        SET last_seen_at = NOW()
        WHERE token_hash = $1
          AND csrf_token IS NOT NULL
          AND LENGTH(csrf_token) > 0
          AND revoked_at IS NULL
          AND expires_at >= NOW()
        RETURNING id, user_id, expires_at, csrf_token
      )
      SELECT
        active_session.user_id,
        active_session.expires_at,
        active_session.id AS session_id,
        active_session.csrf_token,
        u.google_sub,
        u.email,
        u.display_name,
        u.avatar_url,
        u.created_at,
        u.updated_at
      FROM active_session
      JOIN users AS u
        ON u.id = active_session.user_id
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      user: mapUserProfile({
        id: row.user_id,
        google_sub: row.google_sub,
        email: row.email,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        created_at: row.created_at,
        updated_at: row.updated_at
      }),
      csrfToken: row.csrf_token
    };
  }

  async createAuthSession(input: {
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO auth_sessions (
        id,
        user_id,
        token_hash,
        csrf_token,
        created_at,
        expires_at,
        revoked_at,
        last_seen_at,
        user_agent,
        ip_address
      )
      VALUES ($1, $2, $3, $4, NOW(), $5, NULL, NOW(), $6, $7)
      `,
      [
        randomUUID(),
        input.userId,
        input.tokenHash,
        input.csrfToken,
        input.expiresAt.toISOString(),
        input.userAgent,
        input.ipAddress
      ]
    );
  }

  async revokeAuthSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE auth_sessions
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
      `,
      [tokenHash]
    );
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
        hints,
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
        hints,
        status
      FROM scenarios
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapScenario(result.rows[0]);
  }

  async createSession(userId: string, scenarioId: string): Promise<Session> {
    await this.expireActiveSessions(userId);

    const sessionId = randomUUID();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);

    const insert: Session = {
      id: sessionId,
      userId,
      scenarioId,
      status: "active",
      startedAt: startedAt.toISOString(),
      wsUrl: `/ws/sessions/${sessionId}`,
      wsToken: randomUUID(),
      expiresAt: expiresAt.toISOString(),
      hintCount: 0
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
        expires_at,
        hint_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        user_id,
        scenario_id,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at,
        hint_count
      `,
      [
        insert.id,
        insert.userId,
        insert.scenarioId,
        insert.status,
        insert.startedAt,
        insert.wsUrl,
        insert.wsToken,
        insert.expiresAt,
        insert.hintCount
      ]
    );

    return mapSession(result.rows[0]);
  }

  async getActiveSessionByUser(userId: string): Promise<Session | null> {
    await this.expireActiveSessions(userId);

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
        expires_at,
        hint_count
      FROM sessions
      WHERE user_id = $1
        AND status IN ('active', 'submitted')
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapSession(result.rows[0]);
  }

  async getSessionById(id: string): Promise<Session | null> {
    await this.expireSessionById(this.pool, id);

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
        expires_at,
        hint_count
      FROM sessions
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapSession(result.rows[0]);
  }

  async requestHint(
    sessionId: string,
    userId: string
  ): Promise<{ hintIndex: number; hint: string; session: Session } | null> {
    await this.expireSessionById(this.pool, sessionId, userId);

    const result = await this.pool.query<SessionScenarioRow>(
      `
      UPDATE sessions AS s
      SET hint_count = s.hint_count + 1
      FROM scenarios AS sc
      WHERE s.id = $1
        AND s.user_id = $2
        AND s.scenario_id = sc.id
        AND s.status IN ('active', 'submitted')
        AND s.expires_at >= NOW()
      RETURNING
        s.id,
        s.user_id,
        s.scenario_id,
        s.status,
        s.started_at,
        s.ws_url,
        s.ws_token,
        s.expires_at,
        s.hint_count,
        sc.objective AS scenario_objective,
        sc.hints AS scenario_hints,
        sc.estimated_time_minutes AS scenario_estimated_time_minutes
      `,
      [sessionId, userId]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];

    return {
      hintIndex: row.hint_count,
      hint: buildHint(row),
      session: mapSession(row)
    };
  }

  async submitSession(
    sessionId: string,
    userId: string,
    assertions?: AssertionResult[]
  ): Promise<{ attempt: Attempt; session: Session } | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.expireSessionById(client, sessionId, userId);

      const lockResult = await client.query<SessionScenarioRow>(
        `
        SELECT
          s.id,
          s.user_id,
          s.scenario_id,
          s.status,
          s.started_at,
          s.ws_url,
          s.ws_token,
          s.expires_at,
          s.hint_count,
          sc.objective AS scenario_objective,
          sc.hints AS scenario_hints,
          sc.estimated_time_minutes AS scenario_estimated_time_minutes
        FROM sessions AS s
        JOIN scenarios AS sc
          ON sc.id = s.scenario_id
        WHERE s.id = $1
          AND s.user_id = $2
        FOR UPDATE
        `,
        [sessionId, userId]
      );

      if (!lockResult.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const row = lockResult.rows[0];

      if (row.status === "evaluated") {
        const existingAttempt = await this.getLatestAttemptForSession(client, row.id);
        await client.query("COMMIT");

        if (!existingAttempt) {
          return null;
        }

        return {
          attempt: existingAttempt,
          session: mapSession(row)
        };
      }

      if (row.status === "terminated") {
        await client.query("ROLLBACK");
        return null;
      }

      const now = new Date();
      const evaluation = evaluateSubmission({
        objective: row.scenario_objective,
        startedAt: row.started_at,
        evaluatedAt: now,
        estimatedTimeMinutes: row.scenario_estimated_time_minutes,
        hintCount: row.hint_count,
        assertions
      });

      const attemptInsertResult = await client.query<AttemptRow>(
        `
        INSERT INTO attempts (
          id,
          session_id,
          user_id,
          scenario_id,
          score,
          base_score,
          time_bonus,
          hint_penalty,
          passed,
          assertion_results,
          evaluated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        RETURNING
          id,
          session_id,
          user_id,
          scenario_id,
          score,
          base_score,
          time_bonus,
          hint_penalty,
          passed,
          assertion_results,
          evaluated_at
        `,
        [
          randomUUID(),
          row.id,
          row.user_id,
          row.scenario_id,
          evaluation.score,
          evaluation.baseScore,
          evaluation.timeBonus,
          evaluation.hintPenalty,
          evaluation.passed,
          JSON.stringify(evaluation.assertions),
          now.toISOString()
        ]
      );

      const sessionUpdateResult = await client.query<SessionRow>(
        `
        UPDATE sessions
        SET status = 'evaluated',
            submitted_at = $2
        WHERE id = $1
        RETURNING
          id,
          user_id,
          scenario_id,
          status,
          started_at,
          ws_url,
          ws_token,
          expires_at,
          hint_count
        `,
        [row.id, now.toISOString()]
      );

      await client.query("COMMIT");

      return {
        attempt: mapAttempt(attemptInsertResult.rows[0]),
        session: mapSession(sessionUpdateResult.rows[0])
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAttemptsByScenario(
    userId: string,
    scenarioId: string
  ): Promise<Attempt[]> {
    const result = await this.pool.query<AttemptRow>(
      `
      SELECT
        id,
        session_id,
        user_id,
        scenario_id,
        score,
        base_score,
        time_bonus,
        hint_penalty,
        passed,
        assertion_results,
        evaluated_at
      FROM attempts
      WHERE user_id = $1
        AND scenario_id = $2
      ORDER BY evaluated_at DESC
      `,
      [userId, scenarioId]
    );

    return result.rows.map(mapAttempt);
  }

  async listAttemptsByUser(userId: string): Promise<Attempt[]> {
    const result = await this.pool.query<AttemptRow>(
      `
      SELECT
        id,
        session_id,
        user_id,
        scenario_id,
        score,
        base_score,
        time_bonus,
        hint_penalty,
        passed,
        assertion_results,
        evaluated_at
      FROM attempts
      WHERE user_id = $1
      ORDER BY evaluated_at DESC
      `,
      [userId]
    );

    return result.rows.map(mapAttempt);
  }

  async getSessionResult(
    sessionId: string,
    userId: string
  ): Promise<{ attempt: Attempt; session: Session } | null> {
    const session = await this.getSessionById(sessionId);

    if (!session || session.userId !== userId) {
      return null;
    }

    const attempt = await this.getLatestAttemptForSessionById(sessionId);
    if (!attempt) {
      return null;
    }

    return { attempt, session };
  }

  async terminateSession(sessionId: string, userId: string): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE sessions
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW())
      WHERE id = $1
        AND user_id = $2
        AND status IN ('active', 'submitted')
      RETURNING
        id,
        user_id,
        scenario_id,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at,
        hint_count
      `,
      [sessionId, userId]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapSession(result.rows[0]);
  }

  private async getLatestAttemptForSession(
    client: PoolClient,
    sessionId: string
  ): Promise<Attempt | null> {
    const result = await client.query<AttemptRow>(
      `
      SELECT
        id,
        session_id,
        user_id,
        scenario_id,
        score,
        base_score,
        time_bonus,
        hint_penalty,
        passed,
        assertion_results,
        evaluated_at
      FROM attempts
      WHERE session_id = $1
      ORDER BY evaluated_at DESC
      LIMIT 1
      `,
      [sessionId]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapAttempt(result.rows[0]);
  }

  private async getLatestAttemptForSessionById(
    sessionId: string
  ): Promise<Attempt | null> {
    const result = await this.pool.query<AttemptRow>(
      `
      SELECT
        id,
        session_id,
        user_id,
        scenario_id,
        score,
        base_score,
        time_bonus,
        hint_penalty,
        passed,
        assertion_results,
        evaluated_at
      FROM attempts
      WHERE session_id = $1
      ORDER BY evaluated_at DESC
      LIMIT 1
      `,
      [sessionId]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapAttempt(result.rows[0]);
  }

  private async expireActiveSessions(userId: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE sessions
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW())
      WHERE user_id = $1
        AND status IN ('active', 'submitted')
        AND expires_at < NOW()
      `,
      [userId]
    );
  }

  private async expireSessionById(
    queryable: Pool | PoolClient,
    sessionId: string,
    userId?: string
  ): Promise<void> {
    const values = userId ? [sessionId, userId] : [sessionId];
    const userClause = userId ? "AND user_id = $2" : "";

    await queryable.query(
      `
      UPDATE sessions
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW())
      WHERE id = $1
        ${userClause}
        AND status IN ('active', 'submitted')
        AND expires_at < NOW()
      `,
      values
    );
  }

  private async createSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT 'Player'"
    );
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT");
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent TEXT,
        ip_address TEXT
      )
    `);

    await client.query(
      "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ"
    );
    await client.query("ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS csrf_token TEXT");
    await client.query(
      `
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE csrf_token IS NULL
         OR LENGTH(csrf_token) = 0
      `
    );
    await client.query(
      "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
    );
    await client.query("ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT");
    await client.query("ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT");

    await client.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        objective TEXT NOT NULL,
        difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
        estimated_time_minutes INTEGER NOT NULL CHECK (estimated_time_minutes > 0),
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        hints JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL CHECK (status IN ('draft', 'testing', 'published', 'deprecated')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT '[]'::jsonb"
    );

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
        hint_count INTEGER NOT NULL DEFAULT 0,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hint_count INTEGER NOT NULL DEFAULT 0"
    );
    await client.query(
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ"
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        user_id TEXT NOT NULL,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id),
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
        base_score INTEGER NOT NULL CHECK (base_score >= 0 AND base_score <= 100),
        time_bonus INTEGER NOT NULL CHECK (time_bonus >= 0 AND time_bonus <= 20),
        hint_penalty INTEGER NOT NULL CHECK (hint_penalty >= 0 AND hint_penalty <= 20),
        passed BOOLEAN NOT NULL,
        assertion_results JSONB NOT NULL,
        evaluated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await client.query(
      "CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email))"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS auth_sessions_revoked_at_idx ON auth_sessions (revoked_at)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS sessions_scenario_id_idx ON sessions (scenario_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS attempts_user_id_idx ON attempts (user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS attempts_scenario_id_idx ON attempts (scenario_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS attempts_session_id_idx ON attempts (session_id)"
    );
  }

  private async ensureConstraints(client: PoolClient): Promise<void> {
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS sessions_single_active_user_idx ON sessions (user_id) WHERE status IN ('active', 'submitted')"
    );
  }

  private async normalizeActiveSessions(client: PoolClient): Promise<void> {
    await client.query(
      `
      UPDATE sessions
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW())
      WHERE status IN ('active', 'submitted')
        AND expires_at < NOW()
      `
    );

    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY started_at DESC, id DESC
          ) AS rn
        FROM sessions
        WHERE status IN ('active', 'submitted')
      )
      UPDATE sessions AS s
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW())
      FROM ranked AS r
      WHERE s.id = r.id
        AND r.rn > 1
      `
    );
  }

  private async purgeExpiredAuthSessions(client: PoolClient): Promise<void> {
    await client.query(
      `
      DELETE FROM auth_sessions
      WHERE expires_at < NOW() - INTERVAL '7 days'
         OR revoked_at < NOW() - INTERVAL '7 days'
      `
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
          hints,
          status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          objective = EXCLUDED.objective,
          difficulty = EXCLUDED.difficulty,
          estimated_time_minutes = EXCLUDED.estimated_time_minutes,
          tags = EXCLUDED.tags,
          hints = EXCLUDED.hints,
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
          JSON.stringify(scenario.hints),
          scenario.status
        ]
      );
    }
  }
}
