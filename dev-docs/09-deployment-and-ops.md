# 09 - Deployment and Operations

This document covers practical local and GKE-backed run modes.

## Supported Local Modes

### 1) Docker Compose Full Stack (recommended for Docker workspace provider)

```bash
docker compose up --build -d
docker compose ps
```

Services:

- `postgres` on `5432`
- `api` on `3001`
- `web` on `8080`

Web URL: `http://localhost:8080`

Stop:

```bash
docker compose down --remove-orphans
```

### 2) Host Dev Servers + Local Postgres (recommended for Kubernetes workspace provider)

Start Postgres:

```bash
./scripts/dev-postgres-up.sh
```

Run API in Docker workspace mode:

```bash
./scripts/dev-api-docker.sh
```

Run API in Kubernetes workspace mode:

```bash
./scripts/dev-api-k8s.sh
```

Run web:

```bash
./scripts/dev-web.sh
```

Web URL: `http://localhost:5173`

## Required Env

Set in `.env`:

- `GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `WORKSPACE_IMAGE`
- optional provider-specific `WORKSPACE_K8S_*`

## Google Sign-In Local Origins

OAuth web client must include these JavaScript origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:8080`
- `http://127.0.0.1:8080`

If missing, Google Sign-In fails with origin/audience errors and API login returns `401`.

## Kubernetes/GKE Prerequisites

For `WORKSPACE_PROVIDER=kubernetes`:

- kube context must be configured (`kubectl config current-context`)
- `runtimeclass/gvisor` must exist
- namespaces `gitarena-sessions` and `gitarena-api` should exist
- workspace image must be available in Artifact Registry

Helpful scripts:

```bash
./scripts/verify-phase2-gke.sh
./scripts/verify-phase3-gke.sh
./scripts/push-workspace-image-gcp.sh
./scripts/delete-phase2-gke.sh
./scripts/delete-phase3-gke.sh
```

Cluster setup notes: `SETUP.md`

## Operational Checks

After startup:

1. `GET /api/v1/health/ready` returns `200`.
2. Sign in with Google.
3. Start session.
4. Verify workspace runtime appears:
   - Docker mode: `docker ps | grep gitarena-ws-`
   - Kubernetes mode: `kubectl -n gitarena-sessions get pods`
5. Submit or quit session and verify runtime cleanup.

## Logging and Debugging

Compose mode logs:

```bash
docker compose logs -f
```

Host mode logs:

- API logs are terminal output from `npm run dev:api`
- Web logs are terminal output from `npm run dev:web`

## Common Issues

### Port conflicts / stale listeners

Symptoms:

- `EADDRINUSE` on `3001`
- intermittent `502` from `localhost:8080`

Checks:

```bash
ss -ltnp | grep -E ':8080|:3001|:5432|:5173' || true
```

Reset sequence:

1. stop local processes (`Ctrl+C`)
2. `docker compose down --remove-orphans`
3. if stale root-owned listeners remain, restart Docker daemon/Desktop

### Websocket terminal stuck in "connecting"

Check:

- In Vite dev mode, `/ws` proxy must be enabled (`apps/web/vite.config.ts`)
- In Compose mode, nginx `/ws/` proxy must be present (`apps/web/nginx.conf`)
- Workspace runtime must be `Running` (not `Completed`)

### GKE auth plugin errors

If `kubectl` mentions missing `gke-gcloud-auth-plugin`, install it and export:

```bash
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```
