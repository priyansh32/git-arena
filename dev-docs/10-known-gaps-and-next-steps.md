# 10 - Known Gaps and Next Steps

This document tracks current limitations and pragmatic next milestones.

## Current MVP Status

Working today:

- scenario catalog, detail, history UI
- session creation with one active-session constraint
- per-session workspace containers
- websocket terminal bridge
- hint and submit flow
- scenario-specific shell evaluators
- scoring + attempt persistence
- local and GCP low-cost deployment path

Not implemented yet:

- role-based access (`learner/author/admin`)
- scenario authoring admin UI
- richer observability/metrics dashboards

## Highest Priority Next

1. Harden submission integrity (immutable snapshot evaluation path).
2. Harden container/runtime restrictions (privileges, limits, network isolation).
3. Expand automated tests beyond scoring unit tests.
4. Add scenario authoring workflow (draft/test/publish controls).
5. Add production guardrails (rate limiting, abuse controls, backups, alerts).

## Auth and Identity Recommendation

Near-term low-risk path:

- Google sign-in (Firebase Auth or Google Identity + backend verification).
- Store users in Postgres (`users` table).
- Replace `LOCAL_USER_ID` with request-scoped authenticated user id.
- Keep API authorization checks server-side for all session/attempt access.

## Architecture Follow-Ups

As load grows:

- split workspace orchestration into dedicated service/process
- add queue for session provisioning/evaluation jobs
- add per-session resource quotas and hard runtime caps
- move toward private container registry and versioned workspace images

## Testing Gaps

Add:

- integration tests for REST session lifecycle
- websocket terminal interaction tests
- scenario evaluator contract tests (assertion format)
- CI smoke test on every merge to `main`

## Security Gaps

Add before production scale:

- authn/authz
- stricter container isolation profiles
- audit logging for session actions
- secret management (no plaintext env in repo)
- HTTPS/TLS termination and secure headers

## Documentation Follow-Ups

When features ship, update these files first:

- auth -> `04-backend-api.md`, `06-web-client.md`, `07-data-model-and-scoring.md`
- scenario authoring -> `05-workspace-runtime-and-scenarios.md`
- infra changes -> `09-deployment-and-ops.md`
