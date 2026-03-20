# 04 - Backend API Deep Dive

Backend service lives in `apps/api`.

## Entry Point

`src/server.ts`:

- Loads env config via `loadConfig()`.
- Creates `Repository` and `WorkspaceManager`.
- Registers CORS and websocket plugin.
- Defines REST and WS routes.
- On startup: `repository.init()` then `app.listen()`.
- On shutdown: `app.close()` and `repository.close()`.

## Config Surface

`src/config.ts` parses env with zod.

Important env vars:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `WORKSPACE_IMAGE`
- `WORKSPACE_PROVIDER` (`docker` or `kubernetes`)
- `WORKSPACE_ROOT`
- `WORKSPACE_SHELL`
- `WORKSPACE_CONTAINER_PREFIX`
- `WORKSPACE_INIT_COMMAND`
- `WORKSPACE_K8S_NAMESPACE`
- `WORKSPACE_K8S_RUNTIME_CLASS_NAME`
- `WORKSPACE_K8S_IMAGE_PULL_POLICY`
- `WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS`

Default workspace image is `alpine/git:2.47.2`.

## API Routes

Health:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/health`

Auth:

- `POST /api/v1/auth/google`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`

Scenarios:

- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/:id`
- `GET /api/v1/scenarios/:id/attempts`

Session lifecycle:

- `GET /api/v1/users/me/active-session`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `DELETE /api/v1/sessions/:id`
- `POST /api/v1/sessions/:id/hint`
- `POST /api/v1/sessions/:id/submit`
- `GET /api/v1/sessions/:id/result`

History:

- `GET /api/v1/users/me/history`

Terminal:

- `WS /ws/sessions/:id?token=<wsToken>`

## Repository Responsibilities

`src/repository.ts` owns DB interactions:

- Schema bootstrapping (`users`, `auth_sessions`, `scenarios`, `sessions`, `attempts`).
- Session expiration normalization.
- Scenario upsert seeding from `defaultScenarios`.
- User upsert from verified Google identity.
- Session token lifecycle (create, load, revoke, cleanup).
- Session creation, hinting, submit, terminate.
- Attempt fetch by scenario/user/session.

Important invariants:

- At most one active session per user:
  - `sessions_single_active_user_idx` partial unique index on status in `('active','submitted')`.
- Expired sessions are auto-terminated before most reads.

## Workspace Manager Responsibilities

`src/workspace-manager.ts`:

- In `docker` mode, creates per-session containers (`docker run -d --rm ...`).
- In `kubernetes` mode, applies/deletes per-session pods via `kubectl`.
- Seeds scenario by running `seed.sh` inside the active workspace runtime.
- Evaluates submission by running `eval.sh`.
- Opens interactive terminal bridge with `script -qefc` over `docker exec` or `kubectl exec`.

## Error Handling

API error patterns:

- zod validation -> `400` with `issues`.
- Not found or unauthorized resource -> `404`.
- Workspace provisioning/connectivity failures -> `503`.
- Unexpected errors -> `500`.

During submit:

- If evaluator fails unexpectedly, API records a synthetic failing assertion (`evaluator_runtime`) rather than crashing request flow.

## How to Add a New API Route

1. Add route in `src/server.ts`.
2. Add repository method in `src/repository.ts` if DB access needed.
3. Reuse shared contracts from `@gitarena/shared` or add new ones there.
4. Validate inputs with zod.
5. Return consistent payload shape.
6. Add tests (unit/integration as applicable).

## Auth Notes

Auth middleware now injects request-scoped user context from a signed-in cookie:

- cookie value is random session token (`SESSION_COOKIE_NAME`)
- DB stores `sha256` session token hash in `auth_sessions`
- each auth session also has a CSRF token; mutating authenticated routes require `x-gitarena-csrf`
- websocket handshake also validates auth cookie before attaching terminal
