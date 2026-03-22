# GitArena Web App

React + Vite frontend for GitArena.

## Purpose

- Google Sign-In entrypoint
- Scenario browse/start flow
- Terminal workspace UI (`xterm`) over WebSocket
- Result/history views

## Local Run

From repo root:

```bash
./scripts/dev-up.sh web
```

Default URL: `http://localhost:5174` (`DEV_WEB_PORT`)

## Proxy Expectations

In local dev mode, Vite proxies:

- `/api` -> API server
- `/ws` -> API WebSocket endpoint

This proxy behavior is defined in `apps/web/vite.config.ts`.

In compose test-stack runtime (`npm run preview`), Vite preview proxies `/api` and `/ws`
to `VITE_API_PROXY_TARGET` (default `http://api:3001`) so browser traffic stays same-origin.

## Required Env

- `VITE_GOOGLE_CLIENT_ID` must be set in repo `.env`.
- Optional:
  - `DEV_WEB_PORT` (default `5174`) for `./scripts/dev-up.sh web`
  - `DEV_API_PORT` (default `3002`) for dev proxy target
  - `TEST_WEB_PORT` (default `5173`) for `docker compose up --build`
  - `TEST_API_PORT` (default `3001`) for compose API host port
  - `VITE_API_BASE_URL` (compose default: `/api/v1`)
  - `VITE_WS_BASE_URL` (optional explicit WS base URL; default uses current browser host)
  - `VITE_API_PROXY_HOST` (dev-only; default `localhost`)
  - `VITE_API_PROXY_TARGET` (default `http://api:3001` in compose, dev default `http://localhost:${DEV_API_PORT}`)
  - `VITE_ALLOWED_HOSTS` (comma-separated host allowlist for Vite dev + preview)
