# 09 - Deployment and Operations

This project currently targets a low-cost deployment model:

- one VM running Docker Compose
- managed Postgres via Cloud SQL

Detailed runbook also exists in `docs/deployment-gcp-vm.md`.

## Local Production-Like Stack

Use root compose:

```bash
docker compose up --build -d
```

Services:

- `postgres` (`5432`)
- `api` (`3001`)
- `web` (`8080`)

API container needs Docker socket mount so it can create per-session workspace containers.

## GCP VM Deployment Model

Files:

- `deploy/gcp/docker-compose.vm.yml`
- `deploy/gcp/env.vm.example`
- `scripts/gcp/provision-vm.sh`
- `scripts/gcp/deploy-vm.sh`
- `scripts/gcp/destroy-vm.sh`

Runtime services on VM:

- `cloudsql-proxy`
- `api`
- `web`

No VM-hosted Postgres in this path; DB is Cloud SQL.

## Deploy Flow (High Level)

1. Create Cloud SQL instance/database/user.
2. Provision VM with Docker installed.
3. Prepare `deploy/gcp/env.vm` with DB/proxy values.
4. Run deploy script to sync repo and `docker compose up -d --build`.
5. Check readiness endpoint.

## Required Env for VM Runtime

Must be set in `deploy/gcp/env.vm`:

- `INSTANCE_CONNECTION_NAME`
- `DATABASE_URL` (pointing to `cloudsql-proxy:5432`)
- `CORS_ORIGINS`

Optional tuning:

- `WORKSPACE_IMAGE`
- `WORKSPACE_ROOT`
- `WORKSPACE_SHELL`
- `WORKSPACE_CONTAINER_PREFIX`
- `WORKSPACE_INIT_COMMAND`

## Cost Controls

Current low-cost levers:

- use `e2-small` VM baseline
- optionally use spot VM (`USE_SPOT=true`) if interruptions acceptable
- keep Cloud SQL tier minimal for early load
- enforce session TTL and container cleanup (already implemented)

## Operational Checks

Use these in production validation:

1. `GET /api/v1/health/ready` returns `200`.
2. Create and terminate a session; confirm workspace container appears/disappears.
3. Submit a scenario and verify attempt record is stored.
4. Monitor VM disk growth (docker image/cache cleanup policy).

## Logging and Debugging

On VM:

```bash
cd /opt/gitarena
sudo docker compose --env-file deploy/gcp/env.vm -f deploy/gcp/docker-compose.vm.yml logs -f
```

Focus areas:

- API workspace provisioning errors (`docker` failures).
- websocket connection failures.
- Cloud SQL proxy connectivity/auth issues.

