-- GitArena full database schema
-- Idempotent — safe to run on a fresh or existing database.

BEGIN;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Player',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  objective TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  commonality TEXT NOT NULL DEFAULT 'common' CHECK (commonality IN ('very_common', 'common', 'occasional', 'rare')),
  estimated_time_minutes INTEGER NOT NULL CHECK (estimated_time_minutes > 0),
  time_limit_seconds INTEGER NOT NULL DEFAULT 1800 CHECK (time_limit_seconds > 0),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('draft', 'testing', 'published', 'deprecated')),
  active_revision INTEGER NOT NULL DEFAULT 1 CHECK (active_revision > 0),
  workspace_type TEXT NOT NULL DEFAULT 'git',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

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
);

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
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_revoked_at_idx ON auth_sessions (revoked_at);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_scenario_id_idx ON sessions (scenario_id);
CREATE INDEX IF NOT EXISTS sessions_scenario_revision_idx ON sessions (scenario_id, scenario_revision);
CREATE INDEX IF NOT EXISTS scenario_revisions_scenario_id_idx ON scenario_revisions (scenario_id);
CREATE INDEX IF NOT EXISTS attempts_user_id_idx ON attempts (user_id);
CREATE INDEX IF NOT EXISTS attempts_scenario_id_idx ON attempts (scenario_id);
CREATE INDEX IF NOT EXISTS attempts_session_id_idx ON attempts (session_id);

-- Enforce single active session per user
CREATE UNIQUE INDEX IF NOT EXISTS sessions_single_active_user_idx ON sessions (user_id) WHERE status IN ('active', 'submitted');

COMMIT;
