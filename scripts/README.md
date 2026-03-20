# Scripts

This directory contains local development and verification scripts.

## Local Dev Helpers

- `scripts/dev-postgres-up.sh`
  - Starts only local Postgres via Docker Compose and waits for health.
- `scripts/dev-postgres-down.sh`
  - Stops local Postgres service.
- `scripts/dev-api-docker.sh`
  - Runs API in host dev mode with `WORKSPACE_PROVIDER=docker`.
- `scripts/dev-api-k8s.sh`
  - Runs API in host dev mode with `WORKSPACE_PROVIDER=kubernetes`.
- `scripts/dev-web.sh`
  - Runs web app in host dev mode with `VITE_GOOGLE_CLIENT_ID` loaded from `.env`.

## Security Policy Verification

- `scripts/verify-workspace-image-hardening.sh`
  - Builds (or inspects) workspace image and validates hardening requirements.
- `scripts/verify-phase2-gke.sh`
  - Verifies Phase 2 pod security context settings on GKE.
- `scripts/delete-phase2-gke.sh`
  - Tears down verification resources and optionally the verification cluster.
- `scripts/verify-phase3-gke.sh`
  - Applies/validates Phase 3 network policy behavior on GKE.
  - Fails if non-API ingress is still possible (indicates missing NetworkPolicy enforcement).
- `scripts/verify-phase3-docker.sh`
  - Verifies Docker provider runtime hardening on a running workspace container:
    - no network (`--network none`)
    - non-root uid/gid `1000`
    - dropped capabilities / no-new-privileges
    - memory/cpu/pids limits
- `scripts/delete-phase3-gke.sh`
  - Tears down Phase 3 network policy verification resources.
- `scripts/push-workspace-image-gcp.sh`
  - Builds and pushes workspace image to Artifact Registry.

## Stack Smoke Test

- `scripts/smoke-stack.mjs`
  - End-to-end smoke test against running API/web stack.
