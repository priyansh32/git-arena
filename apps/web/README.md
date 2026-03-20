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

Default URL: `http://localhost:5173`

## Proxy Expectations

In local dev mode, Vite proxies:

- `/api` -> API server
- `/ws` -> API WebSocket endpoint

This proxy behavior is defined in `apps/web/vite.config.ts`.

## Required Env

- `VITE_GOOGLE_CLIENT_ID` must be set in repo `.env`.
