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
- `api` on `${API_PORT}` (default `3001`)
- `web` on `${WEB_PORT}` (default `5173`)

Web URL: `http://localhost:5173`

Stop:

```bash
docker compose down --remove-orphans
```

### 2) Host Dev Servers + Local Postgres (recommended for Kubernetes workspace provider)

Start Postgres:

```bash
./scripts/dev-up.sh postgres
```

Run API in Docker workspace mode:

```bash
./scripts/dev-up.sh api docker
```

Run API in Kubernetes workspace mode:

```bash
./scripts/dev-up.sh api k8s
```

Run web:

```bash
./scripts/dev-up.sh web
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
- for k8s image auto-resolution when `WORKSPACE_IMAGE` is unset:
  - `GCP_PROJECT_ID`
  - optional `WORKSPACE_AR_LOCATION`, `WORKSPACE_AR_REPOSITORY`, `WORKSPACE_IMAGE_TAG`

## Google Sign-In Local Origins

OAuth web client must include these JavaScript origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

If missing, Google Sign-In fails with origin/audience errors and API login returns `401`.

## Kubernetes/GKE Prerequisites

For `WORKSPACE_PROVIDER=kubernetes`:

- kube context must be configured (`kubectl config current-context`)
- `runtimeclass/gvisor` must exist
- namespaces `gitarena-sessions` and `gitarena-api` should exist
- workspace image must be available in Artifact Registry

Helpful scripts:

```bash
./scripts/gcp-init.sh
./scripts/gcp-verify.sh
./scripts/verify-docker-security.sh
./scripts/gcp-teardown.sh
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
- intermittent proxy failures from `localhost:5173`

Checks:

```bash
ss -ltnp | grep -E ':5173|:3001|:5432' || true
```

Reset sequence:

1. stop local processes (`Ctrl+C`)
2. `docker compose down --remove-orphans`
3. if stale root-owned listeners remain, restart Docker daemon/Desktop

### Websocket terminal stuck in "connecting"

Check:

- Vite `/ws` proxy must be enabled (`apps/web/vite.config.ts`)
- Workspace runtime must be `Running` (not `Completed`)

### GKE auth plugin errors

If `kubectl` mentions missing `gke-gcloud-auth-plugin`, install it and export:

```bash
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```
