# Data Model and Scoring

## Database Tables

Database is PostgreSQL. Schema is created/updated in `Repository.createSchema()`.

### `users`

- `id` (PK)
- `google_sub` (unique Google account subject)
- `email`, `display_name`, `avatar_url`
- `created_at`, `updated_at`

### `auth_sessions`

Server-side login sessions bound to cookie tokens.

- `id` (PK), `user_id` (FK -> users)
- `token_hash` (sha256 of cookie token, unique)
- `created_at`, `expires_at`, `revoked_at`, `last_seen_at`
- `user_agent`, `ip_address`

### `scenarios`

- `id` (PK), `title`, `description`, `objective`
- `difficulty` (`beginner|intermediate|advanced`)
- `estimated_time_minutes`, `tags` (jsonb), `hints` (jsonb)
- `status` (`draft|testing|published|deprecated`)
- `active_revision` (FK -> scenario_revisions)

### `scenario_revisions`

Immutable revisions per `scenario_id + version`. Each stores `seed_script`, `evaluator_script`, `objective`, `hints`, and `time_limit_seconds`. Sessions pin a revision at creation time so seed/eval stays stable even if a new revision is published later.

### `sessions`

- `id` (PK), `user_id`, `scenario_id` (FK -> scenarios)
- `scenario_revision` (pinned revision)
- `status` (`pending|active|submitted|evaluated|terminated`)
- `started_at`, `expires_at`, `submitted_at`
- `ws_url`, `ws_token`, `hint_count`
- Unique partial index `sessions_single_active_user_idx` on `user_id` where status in `('active','submitted')`

### `attempts`

- `id` (PK), `session_id` (FK -> sessions), `user_id`, `scenario_id`
- `score`, `base_score`, `time_bonus`, `hint_penalty`
- `passed`, `assertion_results` (jsonb), `evaluated_at`

## Scoring Logic

Implemented in `apps/api/src/evaluation.ts`.

- `baseScore`: sum of passed assertion weights, clamped `0..100`
- `timeBonus`: up to `20`, proportional to remaining time
- `hintPenalty`: `hintCount * 5`, capped at `20`
- `score`: `clamp(baseScore + timeBonus - hintPenalty, 0, 100)`
- `passed`: `score >= 70`

Assertion normalization: `checkId` is sanitized, empty explanations replaced, weights rounded and clamped to `0..100`.

## Assertion Output Contract

Evaluator scripts must print one line per check:

```
ASSERT:<checkId>:<PASS|FAIL>:<weight>:<explanation>
```

Example: `ASSERT:head_attached:PASS:15:HEAD is attached to branch 'main'.`

Parser in `workspace-manager.ts` ignores non-matching lines, converts valid lines into `AssertionResult[]`, throws if zero assertions parsed.

## Session Expiration

Any `active/submitted` session with `expires_at < NOW()` is marked `terminated` (with `submitted_at` backfilled). This runs before session fetches, hint requests, submit flows, and during startup normalization.

## Challenge Authoring

- Keep seed deterministic and fast
- Avoid network in seed/eval scripts
- Use clear assertion ids and actionable failure text
- Weights should sum to `100` for predictable scoring
- Preserve multiple valid solution paths (evaluate outcomes, not exact command sequence)

### Add a New Scenario

1. Create `scenarios/<new-id>/metadata.json` with seed.sh and eval.sh scripts.

2. Publish to DB:

```bash
npm run scenario:publish -- --id <new-id> --dir apps/api/scenarios/<new-id> \
  --title "<title>" \
  --description "<description>" \
  --objective "<objective>" \
  --difficulty beginner \
  --estimated-time-minutes 20 \
  --time-limit-seconds 1200 \
  --status testing \
  --tag git --tag branching \
  --hint "start with git status"
```

3. Re-publish after edits: `npm run scenario:publish -- --id <new-id>` (creates new immutable revision, switches `active_revision`).
