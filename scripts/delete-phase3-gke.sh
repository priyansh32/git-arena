#!/usr/bin/env bash
set -Eeuo pipefail

# Teardown helper for Phase 3 verification runs.
# Deletes phase3 network policy and verification pods.

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
FETCH_CREDENTIALS="${FETCH_CREDENTIALS:-true}"

SESSION_PREFIX="${SESSION_PREFIX:-phase3-verify}"

SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"
CHALLENGE_A="session-${SESSION_PREFIX}-a"
CHALLENGE_B="session-${SESSION_PREFIX}-b"
INGRESS_TARGET_POD="challenge-ingress-phase3-verify"
API_BACKEND_POD="api-backend-phase3-verify"
API_OTHER_POD="api-other-phase3-verify"
NETWORK_POLICY_NAME="session-isolation"

info() {
  printf 'INFO: %s\n' "$1"
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

fetch_credentials() {
  if [[ "${FETCH_CREDENTIALS}" != "true" ]]; then
    return
  fi

  command -v gcloud >/dev/null 2>&1 || fail "missing required command: gcloud"
  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID when FETCH_CREDENTIALS=true"

  local location_arg
  location_arg="$(cluster_flag)"

  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
  info "fetching kube credentials for cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null
}

main() {
  command -v kubectl >/dev/null 2>&1 || fail "missing required command: kubectl"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"

  fetch_credentials

  info "deleting phase3 verification pods (best effort)"
  kubectl -n "${SESSIONS_NS}" delete pod "${CHALLENGE_A}" "${CHALLENGE_B}" "${INGRESS_TARGET_POD}" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl -n "${API_NS}" delete pod "${API_BACKEND_POD}" "${API_OTHER_POD}" --ignore-not-found --wait=false >/dev/null 2>&1 || true

  info "deleting networkpolicy/${NETWORK_POLICY_NAME} (best effort)"
  kubectl -n "${SESSIONS_NS}" delete networkpolicy "${NETWORK_POLICY_NAME}" --ignore-not-found >/dev/null 2>&1 || true

  info "phase3 verification resources removed"
}

main "$@"
