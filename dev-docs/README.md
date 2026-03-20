# GitArena Developer Docs

This folder is the engineering onboarding path for contributors.
Read the files in order.

## Reading Order

1. [01-quick-start.md](01-quick-start.md)
2. [02-repo-map.md](02-repo-map.md)
3. [03-architecture-and-flow.md](03-architecture-and-flow.md)
4. [04-backend-api.md](04-backend-api.md)
5. [05-workspace-runtime-and-scenarios.md](05-workspace-runtime-and-scenarios.md)
6. [06-web-client.md](06-web-client.md)
7. [07-data-model-and-scoring.md](07-data-model-and-scoring.md)
8. [08-dev-workflow-testing.md](08-dev-workflow-testing.md)
9. [09-deployment-and-ops.md](09-deployment-and-ops.md)
10. [10-known-gaps-and-next-steps.md](10-known-gaps-and-next-steps.md)

## What This Repo Is

GitArena is a terminal-first Git challenge platform:

- Users launch a challenge session.
- API provisions an isolated workspace runtime (Docker container or Kubernetes pod).
- User interacts with real Git repos in a browser terminal.
- On submit, scenario-specific evaluator scripts grade the repo state.
- Attempts are stored in Postgres and shown in history/result UI.

## Current Scope

- Google Sign-In auth is enabled with server-side cookie sessions and CSRF protection.
- Workspace provider is selectable with `WORKSPACE_PROVIDER` (`docker` or `kubernetes`).
- Hardened workspace base image, pod security settings, and session NetworkPolicy are implemented.
- Scenarios are shell-script driven and bundled in `apps/api/scenarios`.
