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

## GCP Lifecycle (Primary)

- Typical flow:
  - `export GCP_PROJECT_ID=my-gcp-project`
  - `./scripts/gcp-init.sh`
  - `./scripts/gcp-verify.sh`
  - `./scripts/gcp-teardown.sh`
- `scripts/gcp-init.sh`
  - Single bootstrap entrypoint for GCP resources:
    - project + required services
    - GKE cluster create/check
    - network policy enablement
    - gVisor node pool + RuntimeClass
    - required namespaces/RBAC/network policy manifests
    - optional workspace image push (`PUSH_IMAGE=true`)
  - Accepts image env aliases:
    - `AR_LOCATION` or `WORKSPACE_AR_LOCATION`
    - `AR_REPOSITORY` or `WORKSPACE_AR_REPOSITORY`
    - `IMAGE_TAG` or `WORKSPACE_IMAGE_TAG`
- `scripts/gcp-verify.sh`
  - Combined Kubernetes security verification:
    - pod security controls (`runAs`, seccomp, dropped capabilities, resource limits)
    - network isolation (`NetworkPolicy` ingress/egress checks)
  - Automatically deletes temporary verification pods on exit (success or failure).
  - Set `CLEANUP_VERIFY_PODS=false` to keep verification pods for debugging.
  - Supports `--help` and backward-compatible phase aliases (`PHASE2_*`, `PHASE3_*`).
- `scripts/gcp-teardown.sh`
  - Single teardown entrypoint for GCP resources:
    - verification pods and network policy cleanup
    - optional namespace delete
    - optional cluster delete
    - optional Artifact Registry repo delete
  - Accepts image env aliases:
    - `AR_LOCATION` or `WORKSPACE_AR_LOCATION`
    - `AR_REPOSITORY` or `WORKSPACE_AR_REPOSITORY`
- `scripts/gcp-stack.sh`
  - One-command stack lifecycle with shared static IP + pre-shared SSL cert reuse:
    - `./scripts/gcp-stack.sh down`
    - `./scripts/gcp-stack.sh up`
    - `./scripts/gcp-stack.sh redeploy`
    - `./scripts/gcp-stack.sh status`
  - Uses `deploy/k8s/api-deploy.env` (or `API_ENV_FILE`) for API deploy values.
  - Ensures `API_GLOBAL_STATIC_IP_NAME` exists and reuses `API_PRE_SHARED_CERT_NAME`.
  - Designed for "tear down everything, redeploy everything" without changing API IP/cert identity.

## Local Dev Helpers

- `scripts/dev-up.sh`
  - Unified startup for local dev:
    - `./scripts/dev-up.sh postgres`
    - `./scripts/dev-up.sh api docker`
    - `./scripts/dev-up.sh api k8s`
    - `./scripts/dev-up.sh web`
    - `./scripts/dev-up.sh all docker|k8s` (starts api/web in background; postgres starts only when applicable)
  - Uses host-dev ports from `DEV_API_PORT`/`DEV_WEB_PORT` (defaults `3002`/`5174`).
  - `k8s` mode defaults to Cloud SQL via `.dev-runtime/cloudsql.env`.
  - Set `K8S_USE_CLOUDSQL=false` to force local docker-compose postgres in `k8s` mode.
  - Fails fast when API/web ports are already occupied (prints conflicting pid(s)).
- `scripts/dev-down.sh`
  - Unified shutdown for local dev:
    - `./scripts/dev-down.sh api|web|postgres|all`
  - Also cleans stale repo-owned listeners on API/web ports by default (`FORCE_STALE_KILL=true`).
  - Cleans listeners on `DEV_API_PORT`/`DEV_WEB_PORT`.
- `scripts/scenario-publish.sh`
  - Publishes `seed.sh` + `eval.sh` from `apps/api/scenarios/<scenario-id>` into DB-backed immutable scenario revisions.
  - Passes through to `npm run scenario:publish`.
- `scripts/env-lint.sh`
  - Validates `.env` / `.env.example` and `deploy/k8s/api-deploy.env` / `.example`.
  - Flags unknown keys, duplicate keys, and missing required keys.
  - Run with `npm run env:lint`.
  - Intended env model is:
    - `.env` for local/dev runtime
    - `deploy/k8s/api-deploy.env` for GKE API deploy only

Use these as the primary host-dev entrypoints.
`launch.sh` remains available for compose-centric lifecycle commands.

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
