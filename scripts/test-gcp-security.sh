#!/usr/bin/env bash
set -Eeuo pipefail

# Runs security verification scripts against an initialized GKE cluster.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}"
FETCH_CREDENTIALS="${FETCH_CREDENTIALS:-true}"
IMAGE_PROJECT_ID="${IMAGE_PROJECT_ID:-${GCP_PROJECT_ID}}"

RUN_PHASE2="${RUN_PHASE2:-true}"
RUN_PHASE3="${RUN_PHASE3:-true}"

info() {
  printf 'INFO: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"

if [[ "${RUN_PHASE2}" == "true" ]]; then
  info "running Phase 2 verification"
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
    GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME}" \
    GKE_LOCATION="${GKE_LOCATION}" \
    GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE}" \
    CREATE_CLUSTER=false \
    CREATE_GVISOR_POOL=false \
    IMAGE_PROJECT_ID="${IMAGE_PROJECT_ID}" \
    "${ROOT_DIR}/scripts/verify-phase2-gke.sh"
fi

if [[ "${RUN_PHASE3}" == "true" ]]; then
  info "running Phase 3 verification"
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
    GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME}" \
    GKE_LOCATION="${GKE_LOCATION}" \
    GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE}" \
    FETCH_CREDENTIALS="${FETCH_CREDENTIALS}" \
    IMAGE_PROJECT_ID="${IMAGE_PROJECT_ID}" \
    "${ROOT_DIR}/scripts/verify-phase3-gke.sh"
fi

info "GCP security verification complete"
