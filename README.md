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

## Quick start

```bash
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
npm run dev:api
npm run dev:web
```

Required env for auth:

- `GOOGLE_CLIENT_ID` (API token audience validation)
- `VITE_GOOGLE_CLIENT_ID` (frontend Google Sign-In button)

Run API scoring tests:

```bash
npm run test -w @gitarena/api
```

## Docker

Build and run the full stack:

```bash
docker compose up --build
```

Endpoints:

- Web app: `http://localhost:8080`
- API readiness: `http://localhost:3001/api/v1/health/ready`

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
- Scenario scripts are modularized in `apps/api/scenarios/<scenario-id>/{seed.sh,eval.sh}`
- Interactive terminal over websocket at session workspace route
- Dashboard, workspace, result, and history routes
- Google Sign-In with server-side session cookies and per-user API isolation

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

- The API provisions one Docker container per active session using the host Docker socket.
- Container name format: `gitarena-ws-<sessionId>`.
- `docker-compose.yml` mounts `/var/run/docker.sock` into the API service.

## Notes

- `GET /api/v1/scenarios` and `GET /api/v1/scenarios/:id` are public.
- Session, attempt, and history routes require an authenticated cookie session.
