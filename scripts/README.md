# Scripts

This directory contains local development and verification scripts.

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
- `scripts/gcp-verify.sh`
  - Combined Kubernetes security verification:
    - pod security controls (`runAs`, seccomp, dropped capabilities, resource limits)
    - network isolation (`NetworkPolicy` ingress/egress checks)
- `scripts/gcp-teardown.sh`
  - Single teardown entrypoint for GCP resources:
    - verification pods and network policy cleanup
    - optional namespace delete
    - optional cluster delete
    - optional Artifact Registry repo delete

## Local Dev Helpers

- `scripts/dev-up.sh`
  - Unified startup for local dev:
    - `./scripts/dev-up.sh postgres`
    - `./scripts/dev-up.sh api docker`
    - `./scripts/dev-up.sh api k8s`
    - `./scripts/dev-up.sh web`
    - `./scripts/dev-up.sh all docker|k8s` (starts api/web in background + postgres)
- `scripts/dev-down.sh`
  - Unified shutdown for local dev:
    - `./scripts/dev-down.sh api|web|postgres|all`

## Security Policy Verification

- `scripts/verify-docker-security.sh`
  - Combined Docker security verification:
    - workspace image hardening checks
    - runtime container hardening checks (`network none`, non-root, caps dropped, resource limits)

## Stack Smoke Test

- `scripts/smoke-stack.mjs`
  - End-to-end smoke test against running API/web stack.
