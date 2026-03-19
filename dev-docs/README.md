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
- API provisions an isolated Docker workspace container.
- User interacts with real Git repos in a browser terminal.
- On submit, scenario-specific evaluator scripts grade the repo state.
- Attempts are stored in Postgres and shown in history/result UI.

## Current Scope

- Auth is intentionally not implemented yet.
- API currently uses one local profile: `local-dev-user`.
- Scenarios are shell-script driven and bundled in `apps/api/scenarios`.

