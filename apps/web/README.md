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

Default URL: `http://localhost:5173` (`WEB_PORT`)

## Proxy Expectations

In local dev mode, Vite proxies:

- `/api` -> API server
- `/ws` -> API WebSocket endpoint

This proxy behavior is defined in `apps/web/vite.config.ts`.

## Required Env

- `VITE_GOOGLE_CLIENT_ID` must be set in repo `.env`.
- Optional:
  - `WEB_PORT` (default `5173`)
  - `API_PORT` (default `3001`)
  - `VITE_API_PROXY_HOST` (default `localhost`; compose uses `api`)
  - `VITE_API_PROXY_TARGET` (explicit override for proxy URL)
