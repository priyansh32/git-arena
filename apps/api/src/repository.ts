import { createHash, randomUUID } from "node:crypto";

import type {
  AssertionResult,
  Attempt,
  Scenario,
  Session,
  UserProfile
} from "@gitarena/shared";
import { Pool, type PoolClient } from "pg";

import { evaluateSubmission } from "./evaluation.js";
import { runMigrations } from "./migrations.js";

interface ScenarioRow {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Scenario["difficulty"];
  commonality: Scenario["commonality"];
  estimated_time_minutes: number;
  time_limit_seconds?: number;
  tags: unknown;
  hints: unknown;
  status: Scenario["status"];
}

interface SessionRow {
  id: string;
  user_id: string;
  scenario_id: string;
  scenario_revision?: number;
  status: Session["status"];
  started_at: Date;
  ws_url: string;
  ws_token: string;
  expires_at: Date;
  hint_count: number;
  termination_reason?: string | null;
}

interface AttemptRow {
  id: string;
  session_id: string;
  user_id: string;
  scenario_id: string;
  score: number;
  base_score: number;
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

interface MonitorSessionRow extends SessionRow {
  time_limit_seconds: number;
}

export interface ScenarioRuntime {
  scenarioId: string;
  version: number;
  seedScript: string;
  evaluatorScript: string;
}

export interface ScenarioPublishMetadata {
  title: string;
  description: string;
  objective: string;
  difficulty: Scenario["difficulty"];
  commonality: Scenario["commonality"];
  estimatedTimeMinutes: number;
  tags: string[];
  hints: string[];
  status: Scenario["status"];
  timeLimitSeconds: number;
}

export interface PublishScenarioRevisionInput {
  scenarioId: string;
  seedScript: string;
  evaluatorScript: string;
  metadata?: ScenarioPublishMetadata;
}

export interface PublishedScenarioRevision {
  scenarioId: string;
  version: number;
  checksum: string;
  created: boolean;
}

interface ScenarioRevisionRow {
  version: number;
  checksum: string;
  seed_script: string;
  evaluator_script: string;
}

interface ScenarioRuntimeRow {
  scenario_id: string;
  version: number;
  seed_script: string;
  evaluator_script: string;
}

interface ScenarioPublishRow {
  title: string;
  description: string;
  objective: string;
  difficulty: Scenario["difficulty"];
  commonality: Scenario["commonality"];
  estimated_time_minutes: number;
  tags: unknown;
  hints: unknown;
  status: Scenario["status"];
  time_limit_seconds: number;
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

function parseCommonality(value: unknown): Scenario["commonality"] {
  if (
    value === "very_common" ||
    value === "common" ||
    value === "occasional" ||
    value === "rare"
  ) {
    return value;
  }

  return "common";
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

function computeScenarioRevisionChecksum(input: {
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

function mapScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    objective: row.objective,
    difficulty: row.difficulty,
    commonality: parseCommonality(row.commonality),
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
    await runMigrations(this.pool);
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
        sc.id,
        sc.title,
        sc.description,
        sr.objective,
        sc.difficulty,
        sc.commonality,
        sc.estimated_time_minutes,
        sc.tags,
        sr.hints,
        sc.status
      FROM scenarios AS sc
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = sc.id
       AND sr.version = sc.active_revision
      WHERE sc.status = 'published'
      ORDER BY title ASC
      `
    );

    return result.rows.map(mapScenario);
  }

  async getScenarioById(id: string): Promise<Scenario | null> {
    const result = await this.pool.query<ScenarioRow>(
      `
      SELECT
        sc.id,
        sc.title,
        sc.description,
        sr.objective,
        sc.difficulty,
        sc.commonality,
        sc.estimated_time_minutes,
        sc.tags,
        sr.hints,
        sc.status
      FROM scenarios AS sc
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = sc.id
       AND sr.version = sc.active_revision
      WHERE sc.id = $1
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
    const sessionId = randomUUID();
    const startedAt = new Date();
    const timingResult = await this.pool.query<{
      time_limit_seconds: number;
      active_revision: number;
    }>(
      `
      SELECT
        sr.time_limit_seconds,
        sc.active_revision
      FROM scenarios AS sc
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = sc.id
       AND sr.version = sc.active_revision
      WHERE sc.id = $1
      LIMIT 1
      `,
      [scenarioId]
    );

    if (!timingResult.rowCount) {
      throw new Error(`Scenario not found for session creation: ${scenarioId}`);
    }

    const timeLimitSeconds = Math.max(60, timingResult.rows[0].time_limit_seconds);
    const scenarioRevision = Math.max(1, timingResult.rows[0].active_revision);
    const expiresAt = new Date(startedAt.getTime() + timeLimitSeconds * 1000);

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
        scenario_revision,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at,
        hint_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        user_id,
        scenario_id,
        scenario_revision,
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
        scenarioRevision,
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
    const result = await this.pool.query<SessionRow>(
      `
      SELECT
        id,
        user_id,
        scenario_id,
        scenario_revision,
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
    const result = await this.pool.query<SessionRow>(
      `
      SELECT
        id,
        user_id,
        scenario_id,
        scenario_revision,
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
    const result = await this.pool.query<SessionScenarioRow>(
      `
      UPDATE sessions AS s
      SET hint_count = s.hint_count + 1
      FROM scenarios AS sc
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = sc.id
      WHERE s.id = $1
        AND s.user_id = $2
        AND s.scenario_id = sc.id
        AND sr.version = s.scenario_revision
        AND s.status IN ('active', 'submitted')
        AND s.expires_at >= NOW()
      RETURNING
        s.id,
        s.user_id,
        s.scenario_id,
        s.scenario_revision,
        s.status,
        s.started_at,
        s.ws_url,
        s.ws_token,
        s.expires_at,
        s.hint_count,
        sr.objective AS scenario_objective,
        sr.hints AS scenario_hints,
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

      const lockResult = await client.query<SessionScenarioRow>(
        `
        SELECT
          s.id,
          s.user_id,
          s.scenario_id,
          s.scenario_revision,
          s.status,
          s.started_at,
          s.ws_url,
          s.ws_token,
          s.expires_at,
          s.hint_count,
          sr.objective AS scenario_objective,
          sr.hints AS scenario_hints,
          sc.estimated_time_minutes AS scenario_estimated_time_minutes
        FROM sessions AS s
        JOIN scenarios AS sc
          ON sc.id = s.scenario_id
        JOIN scenario_revisions AS sr
          ON sr.scenario_id = sc.id
         AND sr.version = s.scenario_revision
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
          passed,
          assertion_results,
          evaluated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING
          id,
          session_id,
          user_id,
          scenario_id,
          score,
          base_score,
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
          scenario_revision,
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
          submitted_at = COALESCE(submitted_at, NOW()),
          termination_reason = COALESCE(termination_reason, 'user_terminated')
      WHERE id = $1
        AND user_id = $2
        AND status IN ('active', 'submitted')
      RETURNING
        id,
        user_id,
        scenario_id,
        scenario_revision,
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

  async terminateSessionByMonitor(
    sessionId: string,
    reason: string
  ): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE sessions
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW()),
          termination_reason = $2
      WHERE id = $1
        AND status IN ('active', 'submitted', 'evaluated')
      RETURNING
        id,
        user_id,
        scenario_id,
        scenario_revision,
        status,
        started_at,
        ws_url,
        ws_token,
        expires_at,
        hint_count
      `,
      [sessionId, reason]
    );

    if (!result.rowCount) {
      return null;
    }

    return mapSession(result.rows[0]);
  }

  async listActiveSessionsForMonitor(): Promise<
    Array<{ session: Session; timeLimitSeconds: number }>
  > {
    const result = await this.pool.query<MonitorSessionRow>(
      `
      SELECT
        s.id,
        s.user_id,
        s.scenario_id,
        s.scenario_revision,
        s.status,
        s.started_at,
        s.ws_url,
        s.ws_token,
        s.expires_at,
        s.hint_count,
        s.termination_reason,
        sr.time_limit_seconds
      FROM sessions AS s
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = s.scenario_id
       AND sr.version = s.scenario_revision
      WHERE s.status IN ('active', 'submitted')
      ORDER BY s.started_at ASC
      `
    );

    return result.rows.map((row) => ({
      session: mapSession(row),
      timeLimitSeconds: row.time_limit_seconds
    }));
  }

  async getScenarioRuntimeForSession(sessionId: string): Promise<ScenarioRuntime | null> {
    const result = await this.pool.query<ScenarioRuntimeRow>(
      `
      SELECT
        s.scenario_id,
        s.scenario_revision AS version,
        sr.seed_script,
        sr.evaluator_script
      FROM sessions AS s
      JOIN scenario_revisions AS sr
        ON sr.scenario_id = s.scenario_id
       AND sr.version = s.scenario_revision
      WHERE s.id = $1
      LIMIT 1
      `,
      [sessionId]
    );

    if (!result.rowCount) {
      return null;
    }

    return {
      scenarioId: result.rows[0].scenario_id,
      version: result.rows[0].version,
      seedScript: result.rows[0].seed_script,
      evaluatorScript: result.rows[0].evaluator_script
    };
  }

  async publishScenarioRevision(
    input: PublishScenarioRevisionInput
  ): Promise<PublishedScenarioRevision> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const scenarioResult = await client.query<ScenarioPublishRow>(
        `
        SELECT
          title,
          description,
          objective,
          difficulty,
          commonality,
          estimated_time_minutes,
          tags,
          hints,
          status,
          time_limit_seconds
        FROM scenarios
        WHERE id = $1
        FOR UPDATE
        `,
        [input.scenarioId]
      );

      let effectiveMetadata: ScenarioPublishMetadata;

      if (!scenarioResult.rowCount) {
        if (!input.metadata) {
          throw new Error(
            `Scenario '${input.scenarioId}' does not exist. Provide full metadata to create it.`
          );
        }

        effectiveMetadata = input.metadata;
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
            active_revision,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, 1, NOW())
          `,
          [
            input.scenarioId,
            effectiveMetadata.title,
            effectiveMetadata.description,
            effectiveMetadata.objective,
            effectiveMetadata.difficulty,
            effectiveMetadata.commonality,
            effectiveMetadata.estimatedTimeMinutes,
            Math.max(60, effectiveMetadata.timeLimitSeconds),
            JSON.stringify(effectiveMetadata.tags),
            JSON.stringify(effectiveMetadata.hints),
            effectiveMetadata.status
          ]
        );
      } else {
        const row = scenarioResult.rows[0];
        effectiveMetadata = {
          title: input.metadata?.title ?? row.title,
          description: input.metadata?.description ?? row.description,
          objective: input.metadata?.objective ?? row.objective,
          difficulty: input.metadata?.difficulty ?? row.difficulty,
          commonality: input.metadata?.commonality ?? parseCommonality(row.commonality),
          estimatedTimeMinutes:
            input.metadata?.estimatedTimeMinutes ?? row.estimated_time_minutes,
          tags: input.metadata?.tags ?? parseStringArray(row.tags),
          hints: input.metadata?.hints ?? parseStringArray(row.hints),
          status: input.metadata?.status ?? row.status,
          timeLimitSeconds: Math.max(
            60,
            input.metadata?.timeLimitSeconds ?? row.time_limit_seconds
          )
        };

        if (input.metadata) {
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
                updated_at = NOW()
            WHERE id = $1
            `,
            [
              input.scenarioId,
              effectiveMetadata.title,
              effectiveMetadata.description,
              effectiveMetadata.objective,
              effectiveMetadata.difficulty,
              effectiveMetadata.commonality,
              effectiveMetadata.estimatedTimeMinutes,
              effectiveMetadata.timeLimitSeconds,
              JSON.stringify(effectiveMetadata.tags),
              JSON.stringify(effectiveMetadata.hints),
              effectiveMetadata.status
            ]
          );
        }
      }

      const checksum = computeScenarioRevisionChecksum({
        seedScript: input.seedScript,
        evaluatorScript: input.evaluatorScript,
        objective: effectiveMetadata.objective,
        hints: effectiveMetadata.hints,
        timeLimitSeconds: effectiveMetadata.timeLimitSeconds
      });

      const latestRevisionResult = await client.query<ScenarioRevisionRow>(
        `
        SELECT
          version,
          checksum,
          seed_script,
          evaluator_script
        FROM scenario_revisions
        WHERE scenario_id = $1
        ORDER BY version DESC
        LIMIT 1
        `,
        [input.scenarioId]
      );

      const latestRevision = latestRevisionResult.rows[0];
      const scriptsUnchanged =
        latestRevision &&
        latestRevision.seed_script === input.seedScript &&
        latestRevision.evaluator_script === input.evaluatorScript &&
        latestRevision.checksum === checksum;

      if (scriptsUnchanged) {
        await client.query(
          `
          UPDATE scenarios
          SET objective = $2,
              hints = $3::jsonb,
              time_limit_seconds = $4,
              active_revision = $5,
              updated_at = NOW()
          WHERE id = $1
          `,
          [
            input.scenarioId,
            effectiveMetadata.objective,
            JSON.stringify(effectiveMetadata.hints),
            effectiveMetadata.timeLimitSeconds,
            latestRevision.version
          ]
        );
        await client.query("COMMIT");
        return {
          scenarioId: input.scenarioId,
          version: latestRevision.version,
          checksum,
          created: false
        };
      }

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
          checksum
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        `,
        [
          input.scenarioId,
          nextVersion,
          effectiveMetadata.objective,
          JSON.stringify(effectiveMetadata.hints),
          input.seedScript,
          input.evaluatorScript,
          effectiveMetadata.timeLimitSeconds,
          checksum
        ]
      );

      await client.query(
        `
        UPDATE scenarios
        SET objective = $2,
            hints = $3::jsonb,
            time_limit_seconds = $4,
            active_revision = $5,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          input.scenarioId,
          effectiveMetadata.objective,
          JSON.stringify(effectiveMetadata.hints),
          effectiveMetadata.timeLimitSeconds,
          nextVersion
        ]
      );

      await client.query("COMMIT");
      return {
        scenarioId: input.scenarioId,
        version: nextVersion,
        checksum,
        created: true
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

}
