#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-gitarena-vm}"

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
  require_var PROJECT_ID "${PROJECT_ID}"

  gcloud config set project "${PROJECT_ID}" >/dev/null

  if ! gcloud compute instances describe "${VM_NAME}" --project "${PROJECT_ID}" --zone "${ZONE}" >/dev/null 2>&1; then
    echo "VM does not exist: ${VM_NAME}"
    exit 0
  fi

  gcloud compute instances delete "${VM_NAME}" \
    --project "${PROJECT_ID}" \
    --zone "${ZONE}" \
    --quiet
}

main "$@"
