# 07 - Data Model and Scoring

Database is PostgreSQL. Schema is created/updated in `Repository.createSchema()`.

## Tables

## `users`

Stores authenticated GitArena identities.

Important columns:

- `id` (PK)
- `google_sub` (unique Google account subject)
- `email`
- `display_name`
- `avatar_url`
- `created_at`, `updated_at`

## `auth_sessions`

Tracks server-side login sessions bound to cookie tokens.

Important columns:

- `id` (PK)
- `user_id` (FK -> users)
- `token_hash` (sha256 hash of cookie token, unique)
- `created_at`, `expires_at`, `revoked_at`, `last_seen_at`
- `user_agent`, `ip_address`

## `scenarios`

Stores scenario metadata shown in catalog and used during sessions.

Important columns:

- `id` (PK)
- `title`, `description`, `objective`
- `difficulty` (`beginner|intermediate|advanced`)
- `estimated_time_minutes`
- `tags` (jsonb array)
- `hints` (jsonb array)
- `status` (`draft|testing|published|deprecated`)

## `sessions`

Tracks active and completed challenge sessions.

Important columns:

- `id` (PK)
- `user_id`
- `scenario_id` (FK -> scenarios)
- `status` (`pending|active|submitted|evaluated|terminated`)
- `started_at`, `expires_at`, `submitted_at`
- `ws_url`, `ws_token`
- `hint_count`

Important index:

- `sessions_single_active_user_idx` unique partial index on `user_id` where status in `('active','submitted')`

## `attempts`

Stores scoring results per submission.

Important columns:

- `id` (PK)
- `session_id` (FK -> sessions)
- `user_id`
- `scenario_id`
- `score`, `base_score`, `time_bonus`, `hint_penalty`
- `passed`
- `assertion_results` (jsonb)
- `evaluated_at`

## Shared Type Contracts

Types in `packages/shared/src/index.ts` mirror DB payloads for API/web:

- `UserProfile`
- `Scenario`
- `Session`
- `Attempt`
- `AssertionResult`

## Scoring Logic

Implemented in `apps/api/src/evaluation.ts`.

Inputs:

- scenario objective and estimated time
- `startedAt`, `evaluatedAt`
- `hintCount`
- evaluator assertions (optional)

If no assertions are provided, fallback assertions are generated.

Formula:

- `baseScore`: sum of passed assertion weights, clamped `0..100`
- `timeBonus`: up to `20`, proportional to remaining time
- `hintPenalty`: `hintCount * 5`, capped at `20`
- `score`: `clamp(baseScore + timeBonus - hintPenalty, 0, 100)`
- `passed`: `score >= 70`

## Assertion Normalization

When evaluator assertions are provided:

- `checkId` is sanitized
- empty explanations are replaced
- weights are rounded and clamped to `0..100`

## Session Expiration and Cleanup

Repository methods proactively terminate expired sessions:

- any `active/submitted` session with `expires_at < NOW()` is marked `terminated`
- `submitted_at` is backfilled when terminating

This is invoked:

- before session fetches
- before hint request
- before submit flow
- during startup normalization
