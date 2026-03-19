# 02 - Repo Map

This is a monorepo using npm workspaces.

## Top-Level Layout

```text
apps/
  api/      # Fastify API + workspace orchestration + scenario runtime
  web/      # React + Vite UI + xterm terminal client
packages/
  shared/   # shared TypeScript contracts used by api/web
scripts/
  smoke-stack.mjs
dev-docs/   # this onboarding set
```

## Backend (`apps/api`)

Key files:

- `src/server.ts`
  - API routes, websocket terminal bridge, lifecycle hooks.
- `src/repository.ts`
  - Postgres schema bootstrap + query methods.
- `src/workspace-manager.ts`
  - Docker container lifecycle, terminal spawn, scenario seed/eval execution.
- `src/scenario-runtime.ts`
  - Maps scenario id to `seed.sh` + `eval.sh` files.
- `src/scenario-seed.ts`
  - Published scenario metadata inserted into DB.
- `src/evaluation.ts`
  - Score calculation logic from assertions + time + hints.
- `scenarios/<id>/seed.sh` and `scenarios/<id>/eval.sh`
  - Challenge environment seeding and grading scripts.

## Frontend (`apps/web`)

Key files:

- `src/App.tsx`
  - Router and shell.
- `src/pages/*`
  - Dashboard, scenario detail, workspace, result, history.
- `src/components/SessionTerminal.tsx`
  - xterm + websocket interactive terminal.
- `src/api/client.ts`
  - REST client wrappers and API error handling.
- `src/index.css`
  - UI styles and layout.
- `vite.config.ts`
  - Dev proxy from `/api` to local API server.

## Shared Contracts (`packages/shared`)

`packages/shared/src/index.ts` defines:

- `Scenario`
- `Session`
- `Attempt`
- `AssertionResult`
- API payload types (`CreateSessionResponse`, `SubmitSessionResponse`, etc.)

## Runtime / Infra Files

- `docker-compose.yml`
  - Local postgres + api + web services.
- `launch.sh`
  - Helper script to start/stop/log/smoke stack.
- `.env.example`
  - API env defaults for local non-compose runs.
