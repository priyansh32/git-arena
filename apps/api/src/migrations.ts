import type { Pool, PoolClient } from "pg";

/**
 * Run all database migrations and maintenance tasks in a single transaction.
 * Idempotent — safe to run on every deploy or app start.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await createSchema(client);
    await normalizeActiveSessions(client);
    await ensureConstraints(client);
    await purgeExpiredAuthSessions(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createSchema(client: PoolClient): Promise<void> {
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
      commonality TEXT NOT NULL CHECK (commonality IN ('very_common', 'common', 'occasional', 'rare')),
      estimated_time_minutes INTEGER NOT NULL CHECK (estimated_time_minutes > 0),
      time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds > 0),
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      hints JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL CHECK (status IN ('draft', 'testing', 'published', 'deprecated')),
      active_revision INTEGER NOT NULL DEFAULT 1 CHECK (active_revision > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT '[]'::jsonb"
  );
  await client.query(
    "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS commonality TEXT NOT NULL DEFAULT 'common'"
  );
  await client.query(
    "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER NOT NULL DEFAULT 1800"
  );
  await client.query(
    "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS active_revision INTEGER NOT NULL DEFAULT 1"
  );
  await client.query(
    "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'git'"
  );
  await client.query(
    `
    UPDATE scenarios
    SET active_revision = 1
    WHERE active_revision <= 0
    `
  );
  await client.query(
    `
    UPDATE scenarios
    SET time_limit_seconds = GREATEST(estimated_time_minutes * 60, 60)
    WHERE time_limit_seconds <= 0
    `
  );
  await client.query(
    `
    UPDATE scenarios
    SET commonality = 'common'
    WHERE commonality IS NULL
       OR commonality NOT IN ('very_common', 'common', 'occasional', 'rare')
    `
  );
  await client.query(
    `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'scenarios_commonality_check'
      ) THEN
        ALTER TABLE scenarios
        ADD CONSTRAINT scenarios_commonality_check
        CHECK (commonality IN ('very_common', 'common', 'occasional', 'rare'));
      END IF;
    END
    $$;
    `
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS scenario_revisions (
      scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version > 0),
      objective TEXT NOT NULL,
      hints JSONB NOT NULL DEFAULT '[]'::jsonb,
      seed_script TEXT NOT NULL,
      evaluator_script TEXT NOT NULL,
      time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds > 0),
      checksum TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scenario_id, version)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id),
      scenario_revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'submitted', 'evaluated', 'terminated')),
      started_at TIMESTAMPTZ NOT NULL,
      ws_url TEXT NOT NULL,
      ws_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      hint_count INTEGER NOT NULL DEFAULT 0,
      submitted_at TIMESTAMPTZ,
      termination_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hint_count INTEGER NOT NULL DEFAULT 0"
  );
  await client.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scenario_revision INTEGER NOT NULL DEFAULT 1"
  );
  await client.query(
    `
    UPDATE sessions AS s
    SET scenario_revision = sc.active_revision
    FROM scenarios AS sc
    WHERE s.scenario_id = sc.id
      AND NOT EXISTS (
        SELECT 1
        FROM scenario_revisions AS sr
        WHERE sr.scenario_id = s.scenario_id
          AND sr.version = s.scenario_revision
      )
    `
  );
  await client.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ"
  );
  await client.query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS termination_reason TEXT"
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      user_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id),
      score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
      base_score INTEGER NOT NULL CHECK (base_score >= 0 AND base_score <= 100),
      passed BOOLEAN NOT NULL,
      assertion_results JSONB NOT NULL,
      evaluated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await client.query("ALTER TABLE attempts DROP COLUMN IF EXISTS time_bonus");
  await client.query("ALTER TABLE attempts DROP COLUMN IF EXISTS hint_penalty");

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
    "CREATE INDEX IF NOT EXISTS sessions_scenario_revision_idx ON sessions (scenario_id, scenario_revision)"
  );
  await client.query(
    "CREATE INDEX IF NOT EXISTS scenario_revisions_scenario_id_idx ON scenario_revisions (scenario_id)"
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

async function ensureConstraints(client: PoolClient): Promise<void> {
  await client.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS sessions_single_active_user_idx ON sessions (user_id) WHERE status IN ('active', 'submitted')"
  );
}

async function normalizeActiveSessions(client: PoolClient): Promise<void> {
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
        submitted_at = COALESCE(submitted_at, NOW()),
        termination_reason = COALESCE(termination_reason, 'superseded_active_session')
    FROM ranked AS r
    WHERE s.id = r.id
      AND r.rn > 1
    `
  );
}

async function purgeExpiredAuthSessions(client: PoolClient): Promise<void> {
  await client.query(
    `
    DELETE FROM auth_sessions
    WHERE expires_at < NOW() - INTERVAL '7 days'
       OR revoked_at < NOW() - INTERVAL '7 days'
    `
  );
}
