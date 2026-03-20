#!/usr/bin/env bash
set -Eeuo pipefail

# Compatibility wrapper. Prefer: scripts/gcp-teardown.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}"
DELETE_CLUSTER="${DELETE_CLUSTER:-true}"
DELETE_NAMESPACES="${DELETE_NAMESPACES:-true}"
SESSION_ID="${SESSION_ID:-phase2-verify}"

[[ -n "${GCP_PROJECT_ID}" ]] || { echo "FAIL: set GCP_PROJECT_ID" >&2; exit 1; }

exec env \
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
  GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME}" \
  GKE_LOCATION="${GKE_LOCATION}" \
  GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE}" \
  DELETE_CLUSTER="${DELETE_CLUSTER}" \
  DELETE_NAMESPACES="${DELETE_NAMESPACES}" \
  PHASE2_SESSION_ID="${SESSION_ID}" \
  DELETE_VERIFICATION_RESOURCES=true \
  DELETE_NETWORK_POLICY=true \
  "${ROOT_DIR}/scripts/gcp-teardown.sh"
