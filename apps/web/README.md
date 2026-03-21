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

In Docker image runtime (`npm run preview`), Vite proxy is not used. The built client
uses explicit API/WS base URLs via `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.

## Required Env

- `VITE_GOOGLE_CLIENT_ID` must be set in repo `.env`.
- Optional:
  - `WEB_PORT` (default `5173`)
  - `API_PORT` (default `3001`)
  - `VITE_API_BASE_URL` (default `/api/v1` in source; compose sets `http://localhost:3001/api/v1`)
  - `VITE_WS_BASE_URL` (default current browser host; compose sets `ws://localhost:3001`)
  - `VITE_API_PROXY_HOST` (dev-only; default `localhost`)
  - `VITE_API_PROXY_TARGET` (dev-only explicit proxy target URL)
