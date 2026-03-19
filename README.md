# GitArena

Initial implementation scaffold based on `git-arena-designdoc.md`.

## Apps

- `apps/api` - Fastify API (`/api/v1`)
- `apps/web` - React + Vite frontend
- `packages/shared` - shared TypeScript types

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

Fallback for environments without `buildx` or with broken Docker credential helpers:

```bash
mkdir -p /tmp/docker-config-no-creds
printf '{\"auths\":{}}' > /tmp/docker-config-no-creds/config.json
DOCKER_CONFIG=/tmp/docker-config-no-creds DOCKER_BUILDKIT=0 docker compose up --build
```

## Current status

This is a bootstrap foundation with:

- PostgreSQL-backed scenario/session persistence
- API liveness/readiness health endpoints
- Graceful API shutdown handling
- Hint + submit + evaluation pipeline (no shell evaluator yet)
- Attempt history persisted per user
- Static scenario-authored hints served progressively per session
- Dashboard, workspace, result, and history routes
- Auth intentionally left out for now

## API routes (current)

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/health`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/:id`
- `GET /api/v1/scenarios/:id/attempts`
- `POST /api/v1/sessions`
  - Returns `409` if user already has an `active`/`submitted` session.
- `GET /api/v1/sessions/:id`
- `DELETE /api/v1/sessions/:id`
- `POST /api/v1/sessions/:id/hint`
- `POST /api/v1/sessions/:id/submit`
- `GET /api/v1/sessions/:id/result`
- `GET /api/v1/users/me/history`

## Notes

- Authentication is intentionally excluded at this stage.
