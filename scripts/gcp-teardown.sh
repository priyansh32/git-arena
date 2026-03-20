#!/usr/bin/env bash
set -Eeuo pipefail

# Unified teardown script for GitArena GCP verification resources.

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
FETCH_CREDENTIALS="${FETCH_CREDENTIALS:-true}"

DELETE_CLUSTER="${DELETE_CLUSTER:-true}"
DELETE_NAMESPACES="${DELETE_NAMESPACES:-true}"
DELETE_VERIFICATION_RESOURCES="${DELETE_VERIFICATION_RESOURCES:-true}"
DELETE_NETWORK_POLICY="${DELETE_NETWORK_POLICY:-true}"
DELETE_AR_REPOSITORY="${DELETE_AR_REPOSITORY:-false}"
AR_LOCATION="${AR_LOCATION:-us-central1}"
AR_REPOSITORY="${AR_REPOSITORY:-gitarena}"

SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"

POD_SECURITY_SESSION_ID="${POD_SECURITY_SESSION_ID:-${PHASE2_SESSION_ID:-phase2-verify}}"
NETWORK_SESSION_PREFIX="${NETWORK_SESSION_PREFIX:-${PHASE3_SESSION_PREFIX:-phase3-verify}}"
NETWORK_INGRESS_TARGET_POD="${NETWORK_INGRESS_TARGET_POD:-${PHASE3_INGRESS_TARGET_POD:-challenge-ingress-phase3-verify}}"
NETWORK_API_BACKEND_POD="${NETWORK_API_BACKEND_POD:-${PHASE3_API_BACKEND_POD:-api-backend-phase3-verify}}"
NETWORK_API_OTHER_POD="${NETWORK_API_OTHER_POD:-${PHASE3_API_OTHER_POD:-api-other-phase3-verify}}"
SESSION_NETWORK_POLICY_NAME="${SESSION_NETWORK_POLICY_NAME:-session-isolation}"

info() {
  printf 'INFO: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

cluster_flag() {
  if [[ "${GKE_LOCATION_TYPE}" == "region" ]]; then
    printf -- "--region=%s" "${GKE_LOCATION}"
  else
    printf -- "--zone=%s" "${GKE_LOCATION}"
  fi
}

cluster_exists() {
  local location_arg
  location_arg="$(cluster_flag)"

  gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1
}

fetch_credentials() {
  if [[ "${FETCH_CREDENTIALS}" != "true" ]]; then
    return
  fi

  local location_arg
  location_arg="$(cluster_flag)"

  info "fetching kube credentials for cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null
  pass "kube credentials configured"
}

delete_verification_resources() {
  if [[ "${DELETE_VERIFICATION_RESOURCES}" != "true" ]]; then
    return
  fi

  local phase2_pod phase3_a phase3_b
  phase2_pod="session-${POD_SECURITY_SESSION_ID}"
  phase3_a="session-${NETWORK_SESSION_PREFIX}-a"
  phase3_b="session-${NETWORK_SESSION_PREFIX}-b"

  info "deleting verification pods (best effort)"
  kubectl -n "${SESSIONS_NS}" delete pod "${phase2_pod}" "${phase3_a}" "${phase3_b}" "${NETWORK_INGRESS_TARGET_POD}" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl -n "${API_NS}" delete pod "${NETWORK_API_BACKEND_POD}" "${NETWORK_API_OTHER_POD}" --ignore-not-found --wait=false >/dev/null 2>&1 || true

  pass "verification pods cleaned up"
}

delete_network_policy() {
  if [[ "${DELETE_NETWORK_POLICY}" != "true" ]]; then
    return
  fi

  info "deleting networkpolicy/${SESSION_NETWORK_POLICY_NAME} (best effort)"
  kubectl -n "${SESSIONS_NS}" delete networkpolicy "${SESSION_NETWORK_POLICY_NAME}" --ignore-not-found >/dev/null 2>&1 || true
  pass "network policy cleanup complete"
}

delete_namespaces() {
  if [[ "${DELETE_NAMESPACES}" != "true" ]]; then
    return
  fi

  info "deleting namespaces ${SESSIONS_NS} and ${API_NS} (best effort)"
  kubectl delete namespace "${SESSIONS_NS}" --ignore-not-found >/dev/null 2>&1 || true
  kubectl delete namespace "${API_NS}" --ignore-not-found >/dev/null 2>&1 || true
  pass "namespace cleanup issued"
}

delete_cluster() {
  if [[ "${DELETE_CLUSTER}" != "true" ]]; then
    return
  fi

  local location_arg
  location_arg="$(cluster_flag)"

  info "deleting GKE cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters delete "${GKE_CLUSTER_NAME}" "${location_arg}" --quiet
  pass "cluster deleted"
}

delete_artifact_registry_repo() {
  if [[ "${DELETE_AR_REPOSITORY}" != "true" ]]; then
    return
  fi

  info "deleting Artifact Registry repository '${AR_REPOSITORY}' (best effort)"
  gcloud artifacts repositories delete "${AR_REPOSITORY}" --location "${AR_LOCATION}" --quiet >/dev/null 2>&1 || true
  pass "artifact registry cleanup issued"
}

main() {
  need_cmd gcloud
  need_cmd kubectl

  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"

  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

  if cluster_exists; then
    fetch_credentials
    delete_verification_resources
    delete_network_policy
    delete_namespaces
    delete_cluster
  else
    warn "cluster '${GKE_CLUSTER_NAME}' not found"
  fi

  delete_artifact_registry_repo

  pass "GCP teardown complete"
}

main "$@"
