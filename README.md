# GitArena

Initial implementation scaffold based on `git-arena-designdoc.md`.

## Apps

- `apps/api` - Fastify API (`/api/v1`)
- `apps/web` - React + Vite frontend
- `packages/shared` - shared TypeScript types

## Developer Docs

Detailed onboarding + architecture docs live in [`dev-docs/`](dev-docs/README.md):

- Start here: [`dev-docs/README.md`](dev-docs/README.md)
- Quick setup: [`dev-docs/01-quick-start.md`](dev-docs/01-quick-start.md)
- System architecture: [`dev-docs/03-architecture-and-flow.md`](dev-docs/03-architecture-and-flow.md)
- Backend deep dive: [`dev-docs/04-backend-api.md`](dev-docs/04-backend-api.md)
- Scenario runtime and challenge authoring: [`dev-docs/05-workspace-runtime-and-scenarios.md`](dev-docs/05-workspace-runtime-and-scenarios.md)
- Deployment and ops: [`dev-docs/09-deployment-and-ops.md`](dev-docs/09-deployment-and-ops.md)
- Internet test exposure: [`docs/internet-test-setup.md`](docs/internet-test-setup.md)

## Quick start

```bash
# optional (if using nvm): nvm use 24 || nvm install 24
npm install
npm run dev
```

Or use the launch script for containers:

```bash
./launch.sh
```

Or run each app separately:

```bash
cp .env.example .env
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api docker
./scripts/dev-up.sh web
```

For Kubernetes workspace mode in host dev:

```bash
./scripts/dev-up.sh postgres
GCP_PROJECT_ID=<your-project-id> ./scripts/dev-up.sh api k8s
./scripts/dev-up.sh web
```

Required env for auth:

- `GOOGLE_CLIENT_ID` (API token audience validation)
- `VITE_GOOGLE_CLIENT_ID` (frontend Google Sign-In button)

Validate env key consistency:

```bash
npm run env:lint
```

Env surfaces are intentionally reduced to:

- `.env` for local/dev runtime
- `deploy/k8s/api-deploy.env` for GKE API deployment (local-only, generated from `.example`)

Run API scoring tests:

```bash
npm run test -w @gitarena/api
```

Publish scenario scripts to DB-backed revisions:

```bash
npm run scenario:publish -- --id detached-head-recovery
# or
./scripts/scenario-publish.sh --id detached-head-recovery
```

## Docker

Build and run the full stack:

```bash
docker compose up --build
```

Endpoints:

- Web app: `http://localhost:5173`
- API readiness: `http://localhost:3001/api/v1/health/ready`

Default local ports are aligned across host-dev and compose:

- `WEB_PORT` (default `5173`)
- `API_PORT` (default `3001`)

Stop and remove containers:

```bash
docker compose down
```

Equivalent launch script commands:

```bash
./launch.sh start
./launch.sh logs
./launch.sh smoke
./launch.sh stop
```

Run smoke test directly:

```bash
npm run smoke:stack
```

Provider-specific smoke variants:

```bash
npm run smoke:stack:docker
npm run smoke:stack:k8s
```

## Dev Helper Scripts

For host-based dev loops, primary entrypoints are in [`scripts/README.md`](scripts/README.md):

- `./scripts/dev-up.sh`
- `./scripts/dev-down.sh`
- `./scripts/gcp-init.sh`
- `./scripts/gcp-verify.sh`
- `./scripts/gcp-teardown.sh`

## Current status

This is a bootstrap foundation with:

- PostgreSQL-backed scenario/session persistence
- API liveness/readiness health endpoints
- Graceful API shutdown handling
- Hint + submit + evaluation pipeline with scenario-specific shell evaluators
- Attempt history persisted per user
- Static scenario-authored hints served progressively per session
- Docker-backed workspace container provisioning per active session
- Scenario seed scripts that create a real Git challenge repository per workspace
- Scenario runtime is DB-backed with immutable scenario revisions; local files are published via `scenario:publish`
- Interactive terminal over websocket at session workspace route
- Dashboard, workspace, result, and history routes
- Google Sign-In with server-side session cookies and per-user API isolation
- CSRF tokens enforced for mutating authenticated API routes

## API routes (current)

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/health`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/:id`
- `GET /api/v1/scenarios/:id/attempts`
- `GET /api/v1/users/me/active-session`
- `POST /api/v1/sessions`
  - Returns `409` if user already has an `active`/`submitted` session.
- `GET /api/v1/sessions/:id`
- `DELETE /api/v1/sessions/:id`
- `POST /api/v1/sessions/:id/hint`
- `POST /api/v1/sessions/:id/submit`
- `GET /api/v1/sessions/:id/result`
- `GET /api/v1/users/me/history`
- `WS /ws/sessions/:id?token=<wsToken>`

## Workspace Runtime Notes

- The API supports two workspace providers via `WORKSPACE_PROVIDER`:
  - `docker` (default for local dev)
  - `kubernetes` (GKE/K8s pod-backed sessions)
- Docker mode provisions one container per active session using the host Docker socket.
  - Docker runtime is hardened with:
    - `--network none`
    - `--user 1000:1000`
    - `--cap-drop ALL`
    - `--security-opt no-new-privileges`
    - resource limits (`memory/cpu/pids`)
- Kubernetes mode provisions one pod per active session in `WORKSPACE_K8S_NAMESPACE`.
- Kubernetes network isolation policy manifest is available at:
  - `deploy/k8s/session-isolation-networkpolicy.yaml`

## Notes

- `GET /api/v1/scenarios` and `GET /api/v1/scenarios/:id` are public.
- Session, attempt, and history routes require an authenticated cookie session.
