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
- `scripts/push-workspace-image-gcp.sh`
  - Builds and pushes workspace image to Artifact Registry.

## Stack Smoke Test

- `scripts/smoke-stack.mjs`
  - End-to-end smoke test against running API/web stack.
