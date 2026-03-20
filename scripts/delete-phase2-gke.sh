#!/usr/bin/env bash
set -Eeuo pipefail

# Teardown helper for Phase 2 verification runs.
# Deletes verification pod/namespaces (best effort) and optionally deletes the GKE cluster.

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
DELETE_CLUSTER="${DELETE_CLUSTER:-true}"
DELETE_NAMESPACES="${DELETE_NAMESPACES:-true}"

SESSION_ID="${SESSION_ID:-phase2-verify}"
POD_NAME="session-${SESSION_ID}"
SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"

info() {
  printf 'INFO: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

cluster_flag() {
  if [[ "${GKE_LOCATION_TYPE}" == "region" ]]; then
    printf -- "--region=%s" "${GKE_LOCATION}"
  else
    printf -- "--zone=%s" "${GKE_LOCATION}"
  fi
}

main() {
  command -v gcloud >/dev/null 2>&1 || fail "missing required command: gcloud"
  command -v kubectl >/dev/null 2>&1 || fail "missing required command: kubectl"
  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"

  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
  local location_arg
  location_arg="$(cluster_flag)"

  if ! gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1; then
    warn "cluster '${GKE_CLUSTER_NAME}' not found; nothing to delete"
    exit 0
  fi

  info "fetching kube credentials for cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null

  info "deleting verification pod (best effort)"
  kubectl -n "${SESSIONS_NS}" delete pod "${POD_NAME}" --ignore-not-found --wait=false >/dev/null 2>&1 || true

  if [[ "${DELETE_NAMESPACES}" == "true" ]]; then
    info "deleting namespaces ${SESSIONS_NS} and ${API_NS} (best effort)"
    kubectl delete namespace "${SESSIONS_NS}" --ignore-not-found >/dev/null 2>&1 || true
    kubectl delete namespace "${API_NS}" --ignore-not-found >/dev/null 2>&1 || true
  fi

  if [[ "${DELETE_CLUSTER}" == "true" ]]; then
    info "deleting GKE cluster '${GKE_CLUSTER_NAME}'"
    gcloud container clusters delete "${GKE_CLUSTER_NAME}" "${location_arg}" --quiet
    info "cluster deleted"
  else
    info "DELETE_CLUSTER=false; cluster retained"
  fi
}

main "$@"
