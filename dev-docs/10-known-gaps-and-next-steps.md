# 10 - Known Gaps and Next Steps

This document tracks current limitations after workspace hardening Phase 1 and Phase 2 work.

## Current Status Snapshot

Working today:

- Google Sign-In with backend token verification, cookie sessions, and CSRF checks
- Scenario catalog/detail/history and per-user session isolation
- Workspace provisioning with selectable provider:
  - Docker (`WORKSPACE_PROVIDER=docker`)
  - Kubernetes (`WORKSPACE_PROVIDER=kubernetes`)
- Hardened workspace base image and CI hardening checks
- Kubernetes pod security context hardening (gVisor runtime class, non-root, dropped caps)
- Interactive terminal over websocket
- Seed/eval shell runtime and scoring persistence

## Highest Priority Next

1. Phase 3 network isolation:
   - Kubernetes `NetworkPolicy` for challenge-session pods
   - deny-all egress and API-only ingress
2. Phase 4 session monitor and resource-triggered termination.
3. Phase 5 seed script validation pipeline for scenario builds.
4. Phase 6 snapshot/evaluator separation with object storage snapshots.
5. Phase 7 structured audit logging and ops runbook queries.

## Remaining Security Gaps

- Phase 3 network policy manifests are implemented; enforcement still depends on applying them to a cluster CNI that supports `NetworkPolicy`.
- Docker provider now applies deny-network hardening (`--network none`) for local verification, but it does not emulate namespace/label-based Kubernetes policy semantics.
- No session monitor loop for idle/resource termination rules yet.
- Evaluator is not yet split into separate snapshot-driven runtime (policy Phase 6 target).
- Full security audit event taxonomy is not yet implemented.

## Product / Platform Gaps

- role-based access (`learner/author/admin`) is incomplete
- scenario authoring admin build/publish workflow is incomplete
- richer observability dashboards/alerts are not yet implemented

## Testing Gaps

Add:

- integration tests for Kubernetes provider paths
- regression tests for websocket attach across provider modes
- tests for provider-specific failure behavior (pod ready timeout, image pull failure)
- tests for Phase 3+ security controls as they are implemented

## Documentation Follow-Ups

When features ship, update these files first:

- provider/runtime behavior -> `05-workspace-runtime-and-scenarios.md`, `09-deployment-and-ops.md`
- security policy implementation -> `SETUP.md`, `deploy/k8s/README.md`
- auth/session behavior -> `04-backend-api.md`, `06-web-client.md`, `07-data-model-and-scoring.md`
