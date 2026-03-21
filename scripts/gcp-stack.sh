#!/usr/bin/env bash
set -Eeuo pipefail

# One-command stack lifecycle for GCP:
# - down:      tear everything down (cluster + runtime k8s resources)
# - up:        create/prepare cluster, then deploy API manifests
# - redeploy:  down + up
# - status:    print current cluster/ingress/cert status
#
# This script preserves a stable API IP and certificate identity by reusing:
# - a reserved GLOBAL static IP (API_GLOBAL_STATIC_IP_NAME)
# - a GLOBAL pre-shared managed SSL certificate (API_PRE_SHARED_CERT_NAME)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/common.sh"

API_ENV_FILE="${API_ENV_FILE:-${ROOT_DIR}/deploy/k8s/api-deploy.env}"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-preview}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region

API_DOMAIN="${API_DOMAIN:-}"
API_GLOBAL_STATIC_IP_NAME="${API_GLOBAL_STATIC_IP_NAME:-gitarena-api-ip}"
API_PRE_SHARED_CERT_NAME="${API_PRE_SHARED_CERT_NAME:-gitarena-api-cert-global}"

# If certificate is not ACTIVE yet after deploy, optionally allow HTTP temporarily
# so API remains reachable while cert finalizes.
API_ALLOW_HTTP_DURING_CERT_PROVISIONING="${API_ALLOW_HTTP_DURING_CERT_PROVISIONING:-true}"

WAIT_INGRESS_SECONDS="${WAIT_INGRESS_SECONDS:-300}"
WAIT_ROLLOUT_SECONDS="${WAIT_ROLLOUT_SECONDS:-240}"

usage() {
  cat <<'EOF'
Usage:
  GCP_PROJECT_ID=<project-id> ./scripts/gcp-stack.sh <down|up|redeploy|status>

Examples:
  GCP_PROJECT_ID=git-arena-490721 ./scripts/gcp-stack.sh down
  GCP_PROJECT_ID=git-arena-490721 ./scripts/gcp-stack.sh up
  GCP_PROJECT_ID=git-arena-490721 ./scripts/gcp-stack.sh redeploy
  GCP_PROJECT_ID=git-arena-490721 ./scripts/gcp-stack.sh status

Env (common):
  API_ENV_FILE=deploy/k8s/api-deploy.env
  GKE_CLUSTER_NAME=gitarena-preview
  GKE_LOCATION=us-central1-a
  GKE_LOCATION_TYPE=zone|region

TLS/IP reuse:
  API_GLOBAL_STATIC_IP_NAME=gitarena-api-ip
  API_PRE_SHARED_CERT_NAME=gitarena-api-cert-global
  API_DOMAIN=api.git-arena.hellopriyansh.xyz

Optional:
  API_ALLOW_HTTP_DURING_CERT_PROVISIONING=true|false
EOF
}

load_api_env_file() {
  if [[ -f "${API_ENV_FILE}" ]]; then
    info "loading API env from ${API_ENV_FILE}"
    # shellcheck source=/dev/null
    set -a
    source "${API_ENV_FILE}"
    set +a
  else
    warn "API env file not found: ${API_ENV_FILE} (continuing with current env)"
  fi
}

validate_common_env() {
  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"
  [[ -n "${API_DOMAIN}" ]] || fail "set API_DOMAIN (or provide it in ${API_ENV_FILE})"

  require_bool API_ALLOW_HTTP_DURING_CERT_PROVISIONING "${API_ALLOW_HTTP_DURING_CERT_PROVISIONING}"
}

cluster_exists() {
  local location_arg
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"
  gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1
}

ensure_project() {
  info "setting active gcloud project to ${GCP_PROJECT_ID}"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
}

ensure_static_ip() {
  if gcloud compute addresses describe "${API_GLOBAL_STATIC_IP_NAME}" --global >/dev/null 2>&1; then
    pass "static global IP '${API_GLOBAL_STATIC_IP_NAME}' exists"
    return
  fi

  info "creating static global IP '${API_GLOBAL_STATIC_IP_NAME}'"
  gcloud compute addresses create "${API_GLOBAL_STATIC_IP_NAME}" --global >/dev/null
  pass "static global IP created"
}

ensure_pre_shared_cert() {
  if gcloud compute ssl-certificates describe "${API_PRE_SHARED_CERT_NAME}" --global >/dev/null 2>&1; then
    pass "pre-shared SSL cert '${API_PRE_SHARED_CERT_NAME}' exists"
    return
  fi

  info "creating global managed SSL cert '${API_PRE_SHARED_CERT_NAME}' for ${API_DOMAIN}"
  gcloud compute ssl-certificates create "${API_PRE_SHARED_CERT_NAME}" \
    --domains="${API_DOMAIN}" \
    --global >/dev/null
  pass "pre-shared SSL cert creation requested"
}

current_cert_status() {
  gcloud compute ssl-certificates describe "${API_PRE_SHARED_CERT_NAME}" --global --format='value(managed.status)' 2>/dev/null || true
}

current_static_ip_address() {
  gcloud compute addresses describe "${API_GLOBAL_STATIC_IP_NAME}" --global --format='value(address)' 2>/dev/null || true
}

fetch_credentials() {
  local location_arg
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null
}

deploy_api_manifests() {
  export API_GLOBAL_STATIC_IP_NAME
  export API_PRE_SHARED_CERT_NAME

  [[ -f "${ROOT_DIR}/deploy/k8s/api-deploy.yaml" ]] || fail "missing deploy/k8s/api-deploy.yaml"

  info "applying API manifests"
  envsubst < "${ROOT_DIR}/deploy/k8s/api-deploy.yaml" | kubectl apply -f - >/dev/null
  pass "API manifests applied"
}

wait_api_rollout() {
  info "waiting for API deployment rollout"
  kubectl -n "${GITARENA_API_NAMESPACE_DEFAULT}" rollout status deployment/gitarena-api --timeout="${WAIT_ROLLOUT_SECONDS}s" >/dev/null
  pass "API deployment is rolled out"
}

wait_for_ingress_ip() {
  local waited=0
  local ip=""

  info "waiting for ingress external IP"
  while (( waited < WAIT_INGRESS_SECONDS )); do
    ip="$(kubectl -n "${GITARENA_API_NAMESPACE_DEFAULT}" get ingress gitarena-api-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
    if [[ -n "${ip}" ]]; then
      pass "ingress IP assigned (${ip})"
      return
    fi
    sleep 5
    waited=$((waited + 5))
  done

  warn "ingress IP still pending after ${WAIT_INGRESS_SECONDS}s"
}

set_ingress_allow_http() {
  local allow="$1"
  kubectl -n "${GITARENA_API_NAMESPACE_DEFAULT}" annotate ingress gitarena-api-ingress \
    kubernetes.io/ingress.allow-http="${allow}" \
    --overwrite >/dev/null
}

print_status() {
  local cert_status ingress_ip static_ip cluster_state
  cert_status="$(current_cert_status)"
  static_ip="$(current_static_ip_address)"
  ingress_ip="$(kubectl -n "${GITARENA_API_NAMESPACE_DEFAULT}" get ingress gitarena-api-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"

  if cluster_exists; then
    cluster_state="present"
  else
    cluster_state="missing"
  fi

  printf 'Project: %s\n' "${GCP_PROJECT_ID}"
  printf 'Cluster: %s (%s)\n' "${GKE_CLUSTER_NAME}" "${cluster_state}"
  printf 'Static IP (%s): %s\n' "${API_GLOBAL_STATIC_IP_NAME}" "${static_ip:-<missing>}"
  printf 'Pre-shared cert (%s): %s\n' "${API_PRE_SHARED_CERT_NAME}" "${cert_status:-<unknown>}"
  printf 'Ingress IP: %s\n' "${ingress_ip:-<pending>}"
  printf 'API domain: %s\n' "${API_DOMAIN}"
}

cmd_down() {
  info "tearing down GCP stack resources"
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
  GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME}" \
  GKE_LOCATION="${GKE_LOCATION}" \
  GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE}" \
  FETCH_CREDENTIALS=true \
  DELETE_CLUSTER=true \
  DELETE_NAMESPACES=true \
  DELETE_VERIFICATION_RESOURCES=true \
  DELETE_NETWORK_POLICY=true \
  DELETE_AR_REPOSITORY=false \
  "${ROOT_DIR}/scripts/gcp-teardown.sh"
}

cmd_up() {
  ensure_project
  ensure_static_ip
  ensure_pre_shared_cert

  info "bootstrapping cluster prerequisites"
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
  GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME}" \
  GKE_LOCATION="${GKE_LOCATION}" \
  GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE}" \
  CREATE_CLUSTER=true \
  FETCH_CREDENTIALS=true \
  "${ROOT_DIR}/scripts/gcp-init.sh"

  fetch_credentials
  deploy_api_manifests
  wait_api_rollout
  wait_for_ingress_ip

  local cert_status
  cert_status="$(current_cert_status)"
  if [[ "${cert_status}" == "ACTIVE" ]]; then
    set_ingress_allow_http "false"
    pass "certificate ACTIVE; ingress forced to HTTPS only"
  else
    if [[ "${API_ALLOW_HTTP_DURING_CERT_PROVISIONING}" == "true" ]]; then
      set_ingress_allow_http "true"
      warn "certificate status is '${cert_status:-unknown}'. Temporarily enabled HTTP until cert becomes ACTIVE."
      warn "once ACTIVE, run: kubectl -n gitarena-api annotate ingress gitarena-api-ingress kubernetes.io/ingress.allow-http=false --overwrite"
    else
      warn "certificate status is '${cert_status:-unknown}'. HTTPS may fail until it becomes ACTIVE."
    fi
  fi

  print_status
}

cmd_status() {
  ensure_project

  if cluster_exists; then
    fetch_credentials
  fi

  print_status

  if cluster_exists; then
    kubectl -n "${GITARENA_API_NAMESPACE_DEFAULT}" get pods,svc,ingress 2>/dev/null || true
  fi
}

cmd_redeploy() {
  cmd_down
  cmd_up
}

main() {
  local cmd="${1:-}"
  if [[ -z "${cmd}" || "${cmd}" == "-h" || "${cmd}" == "--help" || "${cmd}" == "help" ]]; then
    usage
    return
  fi
  if [[ $# -ne 1 ]]; then
    fail "expected exactly one command (down|up|redeploy|status)"
  fi

  need_cmd gcloud
  need_cmd kubectl
  need_cmd envsubst

  load_api_env_file
  validate_common_env

  case "${cmd}" in
    down) cmd_down ;;
    up) cmd_up ;;
    redeploy) cmd_redeploy ;;
    status) cmd_status ;;
    *) fail "unknown command: ${cmd}" ;;
  esac
}

main "$@"
