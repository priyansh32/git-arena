#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-gitarena-vm}"
REMOTE_ROOT="${REMOTE_ROOT:-/opt/gitarena}"
ENV_FILE="${ENV_FILE:-deploy/gcp/env.vm}"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
}

require_var() {
  local var_name="$1"
  local var_value="$2"
  if [[ -z "${var_value}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
}

main() {
  require_command gcloud
  require_command tar
  require_var PROJECT_ID "${PROJECT_ID}"

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Environment file not found: ${ENV_FILE}" >&2
    echo "Copy deploy/gcp/env.vm.example to ${ENV_FILE} and fill values first." >&2
    exit 1
  fi

  gcloud config set project "${PROJECT_ID}" >/dev/null

  if ! gcloud compute instances describe "${VM_NAME}" --project "${PROJECT_ID}" --zone "${ZONE}" >/dev/null 2>&1; then
    echo "VM not found: ${VM_NAME} (${PROJECT_ID}/${ZONE})" >&2
    exit 1
  fi

  echo "Syncing repository to ${VM_NAME}:${REMOTE_ROOT} ..."
  tar \
    --exclude .git \
    --exclude node_modules \
    --exclude '*.log' \
    --exclude '.env' \
    -czf - . \
    | gcloud compute ssh "${VM_NAME}" \
      --project "${PROJECT_ID}" \
      --zone "${ZONE}" \
      --command "sudo rm -rf '${REMOTE_ROOT}' && sudo mkdir -p '${REMOTE_ROOT}' && sudo tar -xzf - -C '${REMOTE_ROOT}'"

  echo "Uploading runtime env file ..."
  gcloud compute scp "${ENV_FILE}" "${VM_NAME}:/tmp/gitarena.env" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" >/dev/null

  gcloud compute ssh "${VM_NAME}" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" \
    --command "sudo mv /tmp/gitarena.env '${REMOTE_ROOT}/deploy/gcp/env.vm'"

  echo "Building and starting services ..."
  gcloud compute ssh "${VM_NAME}" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" \
    --command "cd '${REMOTE_ROOT}' && sudo docker compose --env-file deploy/gcp/env.vm -f deploy/gcp/docker-compose.vm.yml up -d --build"

  echo "Running health check ..."
  gcloud compute ssh "${VM_NAME}" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" \
    --command "curl -fsS 'http://127.0.0.1/api/v1/health/ready' >/dev/null && echo 'health=ok'"

  local vm_ip
  vm_ip="$(
    gcloud compute instances describe "${VM_NAME}" \
      --project "${PROJECT_ID}" \
      --zone "${ZONE}" \
      --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
  )"

  cat <<EOF
Deployment complete.
VM: ${VM_NAME}
External URL: http://${vm_ip}
EOF
}

main "$@"
