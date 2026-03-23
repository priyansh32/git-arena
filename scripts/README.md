# Scripts

This directory contains local development and verification scripts.

All shell scripts support `-h` / `--help`.

## Workflow Split

- Test stack: `docker compose up --build` (built containers on `TEST_WEB_PORT` / `TEST_API_PORT`)
- Dev stack: `./scripts/dev-up.sh ...` (host hot-reload on `DEV_WEB_PORT` / `DEV_API_PORT`)

## Shared Script Library

- `scripts/lib/common.sh`
  - Shared logging helpers (`info`, `pass`, `warn`, `fail`)
  - Shared cluster location flag helper (`cluster_flag`)
  - Shared default constants (workspace image tag, namespaces, Artifact Registry defaults)

## GCP Verification

- No in-repo GCP verification script is currently maintained.
- Validate cluster security controls with direct `kubectl` checks and manifests under `deploy/k8s/`.

## Local Dev Helpers

- `scripts/dev-up.sh`
  - Unified startup for local dev:
    - `./scripts/dev-up.sh postgres`
    - `./scripts/dev-up.sh api docker`
    - `./scripts/dev-up.sh web`
    - `./scripts/dev-up.sh all docker` (starts api/web in background and starts postgres)
  - Uses host-dev ports from `DEV_API_PORT`/`DEV_WEB_PORT` (defaults `3002`/`5174`).
  - Fails fast when API/web ports are already occupied (prints conflicting pid(s)).
- `scripts/dev-down.sh`
  - Unified shutdown for local dev:
    - `./scripts/dev-down.sh api|web|postgres|all`
  - Also cleans stale repo-owned listeners on API/web ports by default (`FORCE_STALE_KILL=true`).
  - Cleans listeners on `DEV_API_PORT`/`DEV_WEB_PORT`.
- `scripts/env-lint.sh`
  - Validates `.env` / `.env.example` and `deploy/k8s/api-deploy.env` / `.example`.
  - Flags unknown keys, duplicate keys, and missing required keys.
  - Run with `npm run env:lint`.
  - Intended env model is:
    - `.env` for local/dev runtime
    - `deploy/k8s/api-deploy.env` for GKE API deploy only

Use these as the primary host-dev entrypoints.

## Security Policy Verification

- `scripts/verify-docker-security.sh`
  - Combined Docker security verification:
    - workspace image hardening checks
    - runtime container hardening checks (`network none`, non-root, caps dropped, resource limits)

## Stack Smoke Test

- `scripts/smoke-stack.mjs`
  - End-to-end smoke test against running API/web stack.
  - Workspace runtime checks support:
    - `--provider auto` (default)
    - `--provider docker`
    - `--provider k8s` (or `kubernetes`)
  - Optional `--k8s-namespace <ns>` (default: `gitarena-sessions`).

## Scenario Catalog Seed

- `scripts/seed-scenarios.ts`
  - Seeds DB scenario catalog from root `scenarios/<id>/`.
  - Reads `metadata.json`, `seed.sh`, and `eval.sh` per scenario.
  - `metadata.json` requires: `id`, `title`, `description`, `objective`, `difficulty`,
    `commonality`, `estimatedTimeMinutes`, `timeLimitSeconds`, `tags`, `hints`, `status`.
  - Smart revisioning:
    - creates revision when scenario is new
    - creates new revision only when checksum changes
    - leaves revision unchanged when content is identical
  - Optional `--reset` hard-resets scenario data first (`attempts`, `sessions`, `scenario_revisions`, `scenarios`).
  - Run:
    - `npm run scenarios:seed`
    - `npm run scenarios:seed -- --reset`
