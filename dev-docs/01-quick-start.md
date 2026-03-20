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

- Web UI: `http://localhost:5173`
- API readiness: `http://localhost:3001/api/v1/health/ready`

Stop:

```bash
./launch.sh stop
```

## Option B: Run Apps in Local Dev Mode

Use this if you want Vite HMR and direct API logs:

```bash
cp .env.example .env
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api docker
```

In another terminal:

```bash
./scripts/dev-up.sh web
```

Open web app at `http://localhost:5173`.

## Option C: Run API in Kubernetes Workspace Mode (Host Dev)

Use this when testing `WORKSPACE_PROVIDER=kubernetes` against GKE:

```bash
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api k8s
./scripts/dev-up.sh web
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
- Workspace runtime is created for session (docker container or k8s pod).
- Seed script created a Git repo in `/workspace`.
- Workspace runtime is removed when session is terminated.

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

- `5173` web
- `3001` api
- `5432` postgres

Change mapping in `docker-compose.yml` if needed.

Fast check:

```bash
ss -ltnp | grep -E ':5173|:3001|:5432' || true
```

If stale root-owned docker listeners remain after compose down, restart Docker daemon/Desktop.

## Web loads but terminal does not connect

Check:

- `GET /api/v1/sessions/:id` returns active/submitted session.
- Browser websocket URL is `ws://<host>/ws/sessions/:id?token=<token>`.
- In both host-dev and compose modes, Vite proxies `/ws` to API (`apps/web/vite.config.ts`).

## Google Sign-In fails with origin/audience errors

Symptoms:

- Browser logs include `The given origin is not allowed for the given client ID`.
- API login returns `401` for `/api/v1/auth/google`.

Fix:

- Ensure `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` are the same OAuth web client.
- In Google Cloud Console OAuth client, add local JS origins:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
