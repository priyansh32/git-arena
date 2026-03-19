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
npm run dev:api
npm run dev:web
```

## Docker

Build and run the full stack:

```bash
docker compose up --build
```

Endpoints:

- Web app: `http://localhost:8080`
- API: `http://localhost:3001/api/v1/health`

Stop and remove containers:

```bash
docker compose down
```

Equivalent launch script commands:

```bash
./launch.sh start
./launch.sh logs
./launch.sh stop
```

Fallback for environments without `buildx` or with broken Docker credential helpers:

```bash
mkdir -p /tmp/docker-config-no-creds
printf '{\"auths\":{}}' > /tmp/docker-config-no-creds/config.json
DOCKER_CONFIG=/tmp/docker-config-no-creds DOCKER_BUILDKIT=0 docker compose up --build
```

## Current status

This is a bootstrap foundation with:

- Scenario catalog API (mock/in-memory)
- Session creation stub API
- Dashboard and scenario detail routes
- Basic result-driven flow from frontend to backend

## API routes (current)

- `GET /api/v1/health`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/:id`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
