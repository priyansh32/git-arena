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
- `GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`

## Operational Checks

Validate after startup:

1. `GET /api/v1/health/ready` returns `200`.
2. Sign in from web app with Google.
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

## Kubernetes Readiness (GCP/GKE)

Security-policy session pod templates are available in `deploy/k8s/`.

- `deploy/k8s/challenge-session-pod.yaml` contains pod/container security context, gVisor runtime class, and env allowlist.
- `SETUP.md` documents required cluster prerequisites (gVisor runtime class availability).

Current local runtime still provisions session workspaces through Docker (`WorkspaceManager`).
Kubernetes orchestration migration is handled separately from these manifest hardening changes.
