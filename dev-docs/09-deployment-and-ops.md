# 09 - Deployment and Operations

Current focus is local development reliability with Docker Compose.

## Local Stack

Run:

```bash
docker compose up --build -d
```

Services:

- `postgres` (`5432`)
- `api` (`3001`)
- `web` (`8080`)

## Required Env

Set in `.env`:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `AUTH_MODE` (`simulated` for local dev)
- `GOOGLE_CLIENT_ID` (only required if `AUTH_MODE=google`)
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`

## Operational Checks

Validate after startup:

1. `GET /api/v1/health/ready` returns `200`.
2. Sign in from web app (simulated mode).
3. Create and terminate a session; container appears/disappears.
4. Submit a scenario and verify attempt history is stored.

## Logging and Debugging

```bash
docker compose logs -f
```

Watch for:

- API workspace provisioning errors (`docker` failures).
- websocket connection failures.
- database connectivity errors.
