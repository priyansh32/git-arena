# 01 - Quick Start

This guide gets the full stack running locally, then validates that workspace containers and terminal sessions work.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker with Docker Compose plugin
- Linux/macOS recommended (Windows with WSL2 is fine)

## Clone + Install

```bash
git clone <repo-url>
cd git-arena
npm install
```

## Option A: Fastest Full Stack Start (Recommended)

```bash
./launch.sh start
```

Open:

- Web UI: `http://localhost:8080`
- API readiness: `http://localhost:3001/api/v1/health/ready`

Stop:

```bash
./launch.sh stop
```

## Option B: Run Apps in Local Dev Mode

Use this if you want Vite HMR and direct API logs:

```bash
cp .env.example .env
npm run dev:api
```

In another terminal:

```bash
npm run dev:web
```

Open web app at `http://localhost:5173`.

## Validate Stack Health

Run built-in smoke checks:

```bash
npm run smoke:stack
```

What this verifies:

- API is up and serving scenarios.
- Session creation rules work (`201`, then `409` on duplicate active session).
- Workspace container is created for session.
- Seed script created a Git repo in `/workspace`.
- Container is removed when session is terminated.

## Common Startup Issues

## Docker is unavailable

Symptoms:

- Session create returns `503`.
- Message mentions workspace provisioning failure.

Fix:

- Ensure Docker daemon is running.
- Ensure API container has Docker socket mounted (`/var/run/docker.sock`).

## Port conflicts

Default ports:

- `8080` web
- `3001` api
- `5432` postgres

Change mapping in `docker-compose.yml` if needed.

## Web loads but terminal does not connect

Check:

- `GET /api/v1/sessions/:id` returns active/submitted session.
- Browser websocket URL is `ws://<host>/ws/sessions/:id?token=<token>`.
- Nginx in web container proxies `/ws/` to API (see `apps/web/nginx.conf`).

