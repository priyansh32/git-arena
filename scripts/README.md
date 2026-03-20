# Scripts

This directory contains local development and verification scripts.

## GCP Lifecycle (Primary)

- Typical flow:
  - `export GCP_PROJECT_ID=my-gcp-project`
  - `./scripts/gcp-init.sh`
  - `./scripts/test-gcp-security.sh`
  - `./scripts/gcp-teardown.sh`
- `scripts/gcp-init.sh`
  - Single bootstrap entrypoint for GCP resources:
    - project + required services
    - GKE cluster create/check
    - network policy enablement
    - gVisor node pool + RuntimeClass
    - required namespaces/RBAC/network policy manifests
    - optional workspace image push (`PUSH_IMAGE=true`)
- `scripts/gcp-teardown.sh`
  - Single teardown entrypoint for GCP resources:
    - verification pods and network policy cleanup
    - optional namespace delete
    - optional cluster delete
    - optional Artifact Registry repo delete

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

- `scripts/test-gcp-security.sh`
  - Runs Phase 2 + Phase 3 GKE verification scripts against initialized cluster.
- `scripts/verify-workspace-image-hardening.sh`
  - Builds (or inspects) workspace image and validates hardening requirements.
- `scripts/verify-phase2-gke.sh`
  - Verifies Phase 2 pod security context settings on GKE.
  - Assumes cluster/bootstrap is already done (use `gcp-init.sh` first).
- `scripts/verify-phase3-gke.sh`
  - Applies/validates Phase 3 network policy behavior on GKE.
  - Fails if non-API ingress is still possible (indicates missing NetworkPolicy enforcement).
- `scripts/verify-phase3-docker.sh`
  - Verifies Docker provider runtime hardening on a running workspace container:
    - no network (`--network none`)
    - non-root uid/gid `1000`
    - dropped capabilities / no-new-privileges
    - memory/cpu/pids limits
- `scripts/push-workspace-image-gcp.sh`
  - Builds and pushes workspace image to Artifact Registry.

## Stack Smoke Test

- `scripts/smoke-stack.mjs`
  - End-to-end smoke test against running API/web stack.
