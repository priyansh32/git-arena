# GCP Low-Cost Deployment (Single VM + Cloud SQL)

This runbook deploys GitArena with the lowest-cost near-term architecture:

- 1 Compute Engine VM (`e2-small` by default)
- Cloud SQL for PostgreSQL
- Cloud SQL Auth Proxy sidecar
- Docker Compose on the VM

This setup keeps operational complexity low while preserving managed Postgres.

## 1. Prerequisites

- `gcloud` CLI authenticated (`gcloud auth login`)
- Project access with permissions for:
  - Compute Engine
  - Cloud SQL
  - IAM policy updates
- Domain/TLS is optional for now (HTTP on port 80 is used in this baseline)

## 2. Create Cloud SQL (PostgreSQL)

Example commands (adjust region/tier as needed):

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SQL_INSTANCE="gitarena-pg"
export DB_NAME="gitarena"
export DB_USER="gitarena"
export DB_PASSWORD="replace-with-strong-password"

gcloud config set project "${PROJECT_ID}"

gcloud sql instances create "${SQL_INSTANCE}" \
  --database-version=POSTGRES_16 \
  --region="${REGION}" \
  --tier=db-custom-1-3840 \
  --availability-type=ZONAL \
  --storage-size=20

gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}"
gcloud sql users create "${DB_USER}" --instance="${SQL_INSTANCE}" --password="${DB_PASSWORD}"
```

Get instance connection name:

```bash
gcloud sql instances describe "${SQL_INSTANCE}" \
  --format='value(connectionName)'
```

## 3. Provision VM

```bash
export PROJECT_ID="your-project-id"
export ZONE="us-central1-a"
export VM_NAME="gitarena-vm"

# Optional cost knobs:
# export MACHINE_TYPE="e2-small"
# export BOOT_DISK_SIZE_GB="30"
# export USE_SPOT="true"
# export SERVICE_ACCOUNT_EMAIL="your-vm-sa@your-project-id.iam.gserviceaccount.com"

./scripts/gcp/provision-vm.sh
```

The VM service account must have `roles/cloudsql.client`.

## 4. Prepare Runtime Env

Copy and edit:

```bash
cp deploy/gcp/env.vm.example deploy/gcp/env.vm
```

Required values in `deploy/gcp/env.vm`:

- `INSTANCE_CONNECTION_NAME` (from Cloud SQL)
- `DATABASE_URL` (must point to `cloudsql-proxy:5432`)
- `CORS_ORIGINS`

Example:

```env
INSTANCE_CONNECTION_NAME=your-project:us-central1:gitarena-pg
DATABASE_URL=postgres://gitarena:replace-with-strong-password@cloudsql-proxy:5432/gitarena
CORS_ORIGINS=https://gitarena.example.com
```

## 5. Deploy App

```bash
export PROJECT_ID="your-project-id"
export ZONE="us-central1-a"
export VM_NAME="gitarena-vm"
export ENV_FILE="deploy/gcp/env.vm"

./scripts/gcp/deploy-vm.sh
```

After deploy, app is available at:

- `http://<vm-external-ip>/`

Health endpoint:

- `http://<vm-external-ip>/api/v1/health/ready`

## 6. Operational Commands

SSH:

```bash
gcloud compute ssh "${VM_NAME}" --zone "${ZONE}" --project "${PROJECT_ID}"
```

View logs on VM:

```bash
cd /opt/gitarena
sudo docker compose --env-file deploy/gcp/env.vm -f deploy/gcp/docker-compose.vm.yml logs -f
```

Redeploy after code changes:

```bash
./scripts/gcp/deploy-vm.sh
```

Destroy VM to stop costs:

```bash
export PROJECT_ID="your-project-id"
export ZONE="us-central1-a"
export VM_NAME="gitarena-vm"
./scripts/gcp/destroy-vm.sh
```

## 7. Cost Guidance

- Start with `e2-small`.
- Use zonal Cloud SQL for early stage, move to HA once uptime requirements increase.
- Turn on `USE_SPOT=true` only if you can tolerate VM interruptions.
- Enforce session TTL and idle cleanup (already implemented) to cap workspace container spend.
