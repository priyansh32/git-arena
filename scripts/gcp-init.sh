#!/usr/bin/env bash
set -Eeuo pipefail

# Unified GCP bootstrap script for GitArena verification environments.
# Creates/updates cluster prerequisites, optional workspace image push, and
# applies core Kubernetes manifests required for policy verification.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/common.sh"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
GKE_MODE="${GKE_MODE:-standard}" # standard|autopilot

CREATE_CLUSTER="${CREATE_CLUSTER:-true}"
NUM_NODES="${NUM_NODES:-1}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-2}"
DISK_TYPE="${DISK_TYPE:-pd-standard}"
DISK_SIZE_GB="${DISK_SIZE_GB:-30}"

ENABLE_NETWORK_POLICY="${ENABLE_NETWORK_POLICY:-true}"
CREATE_GVISOR_POOL="${CREATE_GVISOR_POOL:-true}" # standard mode only
SANDBOX_POOL_NAME="${SANDBOX_POOL_NAME:-sandbox-pool}"
SANDBOX_POOL_NODES="${SANDBOX_POOL_NODES:-1}"

FETCH_CREDENTIALS="${FETCH_CREDENTIALS:-true}"
ENSURE_NAMESPACES="${ENSURE_NAMESPACES:-true}"
APPLY_API_RBAC="${APPLY_API_RBAC:-true}"
APPLY_SESSION_NETWORK_POLICY="${APPLY_SESSION_NETWORK_POLICY:-true}"
ENSURE_RUNTIMECLASS="${ENSURE_RUNTIMECLASS:-true}"

PUSH_IMAGE="${PUSH_IMAGE:-false}"
AR_LOCATION="${AR_LOCATION:-${WORKSPACE_AR_LOCATION:-${GITARENA_AR_LOCATION_DEFAULT}}}"
AR_REPOSITORY="${AR_REPOSITORY:-${WORKSPACE_AR_REPOSITORY:-${GITARENA_AR_REPOSITORY_DEFAULT}}}"
IMAGE_TAG="${IMAGE_TAG:-${WORKSPACE_IMAGE_TAG:-${GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT}}}"
LOCAL_IMAGE_TAG="${LOCAL_IMAGE_TAG:-gitarena-base:${IMAGE_TAG}}"
PRUNE_DANGLING_WORKSPACE_IMAGES="${PRUNE_DANGLING_WORKSPACE_IMAGES:-true}"

SESSIONS_NS="${SESSIONS_NS:-${GITARENA_SESSIONS_NAMESPACE_DEFAULT}}"
API_NS="${API_NS:-${GITARENA_API_NAMESPACE_DEFAULT}}"

usage() {
  cat <<'EOF'
Usage:
  GCP_PROJECT_ID=<project-id> ./scripts/gcp-init.sh

Options:
  -h, --help show this message

Common env toggles:
  GKE_CLUSTER_NAME=gitarena-verify-1
  GKE_LOCATION=us-central1-a
  GKE_LOCATION_TYPE=zone|region
  GKE_MODE=standard|autopilot
  CREATE_CLUSTER=true|false
  ENABLE_NETWORK_POLICY=true|false
  CREATE_GVISOR_POOL=true|false
  FETCH_CREDENTIALS=true|false
  PUSH_IMAGE=true|false

Image env:
  AR_LOCATION / WORKSPACE_AR_LOCATION
  AR_REPOSITORY / WORKSPACE_AR_REPOSITORY
  IMAGE_TAG / WORKSPACE_IMAGE_TAG
EOF
}

ensure_project_and_services() {
  info "setting active gcloud project to ${GCP_PROJECT_ID}"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

  info "ensuring required Google APIs are enabled"
  gcloud services enable container.googleapis.com artifactregistry.googleapis.com >/dev/null
  pass "required Google APIs are enabled"
}

ensure_cluster() {
  local location_arg
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"

  if gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1; then
    info "cluster '${GKE_CLUSTER_NAME}' already exists"
    return
  fi

  if [[ "${CREATE_CLUSTER}" != "true" ]]; then
    fail "cluster '${GKE_CLUSTER_NAME}' does not exist and CREATE_CLUSTER=false"
  fi

  info "creating ${GKE_MODE} cluster '${GKE_CLUSTER_NAME}' (${GKE_LOCATION_TYPE}=${GKE_LOCATION})"

  if [[ "${GKE_MODE}" == "autopilot" ]]; then
    gcloud container clusters create-auto "${GKE_CLUSTER_NAME}" "${location_arg}"
  else
    local create_args=(
      "${location_arg}"
      "--num-nodes=${NUM_NODES}"
      "--machine-type=${MACHINE_TYPE}"
      "--disk-type=${DISK_TYPE}"
      "--disk-size=${DISK_SIZE_GB}"
    )

    if [[ "${ENABLE_NETWORK_POLICY}" == "true" ]]; then
      create_args+=("--enable-network-policy")
    fi

    gcloud container clusters create "${GKE_CLUSTER_NAME}" "${create_args[@]}"
  fi

  pass "cluster '${GKE_CLUSTER_NAME}' is available"
}

fetch_credentials() {
  if [[ "${FETCH_CREDENTIALS}" != "true" ]]; then
    return
  fi

  local location_arg
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"

  info "fetching kube credentials for cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null
  pass "kube credentials configured"
}

ensure_network_policy_enabled() {
  if [[ "${ENABLE_NETWORK_POLICY}" != "true" ]]; then
    return
  fi

  if [[ "${GKE_MODE}" != "standard" ]]; then
    warn "GKE_MODE=${GKE_MODE}; skipping explicit network policy toggles"
    return
  fi

  local location_arg np_enabled np_provider np_addon_disabled
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"

  np_enabled="$(gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" --format='value(networkPolicy.enabled)' 2>/dev/null || true)"
  np_provider="$(gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" --format='value(networkPolicy.provider)' 2>/dev/null || true)"
  np_addon_disabled="$(gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" --format='value(addonsConfig.networkPolicyConfig.disabled)' 2>/dev/null || true)"

  if [[ "${np_enabled}" == "true" || "${np_provider}" == "CALICO" || "${np_addon_disabled}" == "false" ]]; then
    pass "network policy enforcement already enabled"
    return
  fi

  if [[ "${np_enabled}" != "false" && "${np_addon_disabled}" != "true" ]]; then
    warn "could not conclusively determine network policy state; skipping automatic update"
    warn "if needed, run: gcloud container clusters update ${GKE_CLUSTER_NAME} ${location_arg} --update-addons=NetworkPolicy=ENABLED"
    warn "then run: gcloud container clusters update ${GKE_CLUSTER_NAME} ${location_arg} --enable-network-policy"
    return
  fi

  if [[ "${np_addon_disabled}" == "true" ]]; then
    info "enabling NetworkPolicy addon on control plane"
    gcloud container clusters update "${GKE_CLUSTER_NAME}" "${location_arg}" --update-addons=NetworkPolicy=ENABLED --quiet
  fi

  info "enabling network policy enforcement on nodes (rolling update)"
  gcloud container clusters update "${GKE_CLUSTER_NAME}" "${location_arg}" --enable-network-policy --quiet

  pass "network policy enforcement enabled"
}

ensure_gvisor_pool() {
  if [[ "${GKE_MODE}" != "standard" || "${CREATE_GVISOR_POOL}" != "true" ]]; then
    return
  fi

  local location_arg
  location_arg="$(cluster_flag "${GKE_LOCATION_TYPE}" "${GKE_LOCATION}")"

  if gcloud container node-pools describe "${SANDBOX_POOL_NAME}" --cluster "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1; then
    pass "gVisor node pool '${SANDBOX_POOL_NAME}' exists"
    return
  fi

  info "creating gVisor node pool '${SANDBOX_POOL_NAME}'"
  gcloud container node-pools create "${SANDBOX_POOL_NAME}" \
    --cluster "${GKE_CLUSTER_NAME}" \
    "${location_arg}" \
    --num-nodes="${SANDBOX_POOL_NODES}" \
    --machine-type="${MACHINE_TYPE}" \
    --disk-type="${DISK_TYPE}" \
    --disk-size="${DISK_SIZE_GB}" \
    --sandbox type=gvisor

  pass "gVisor node pool '${SANDBOX_POOL_NAME}' ready"
}

ensure_runtimeclass() {
  if [[ "${ENSURE_RUNTIMECLASS}" != "true" ]]; then
    return
  fi

  if kubectl get runtimeclass gvisor >/dev/null 2>&1; then
    pass "runtimeclass/gvisor exists"
    return
  fi

  info "runtimeclass/gvisor missing; applying fallback manifest"
  kubectl apply -f - <<'YAML' >/dev/null
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
YAML

  pass "runtimeclass/gvisor applied"
}

ensure_namespaces() {
  if [[ "${ENSURE_NAMESPACES}" != "true" ]]; then
    return
  fi

  kubectl create namespace "${SESSIONS_NS}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl create namespace "${API_NS}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  pass "required namespaces exist"
}

apply_api_rbac() {
  if [[ "${APPLY_API_RBAC}" != "true" ]]; then
    return
  fi

  kubectl apply -f "${ROOT_DIR}/deploy/k8s/api-workspace-rbac.yaml" >/dev/null
  pass "api workspace RBAC applied"
}

apply_session_network_policy() {
  if [[ "${APPLY_SESSION_NETWORK_POLICY}" != "true" ]]; then
    return
  fi

  kubectl apply -f "${ROOT_DIR}/deploy/k8s/session-isolation-networkpolicy.yaml" >/dev/null
  pass "session isolation network policy applied"
}

push_workspace_image_if_requested() {
  if [[ "${PUSH_IMAGE}" != "true" ]]; then
    return
  fi

  local image_uri
  image_uri="$(workspace_image_ref "${GCP_PROJECT_ID}" "${AR_LOCATION}" "${AR_REPOSITORY}" "${IMAGE_TAG}")"

  info "ensuring Artifact Registry repository '${AR_REPOSITORY}' exists"
  gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --repository-format=docker \
    --location="${AR_LOCATION}" \
    --description="GitArena workspace images" >/dev/null 2>&1 || true

  info "configuring docker auth for ${AR_LOCATION}-docker.pkg.dev"
  gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet >/dev/null

  info "building workspace image ${image_uri}"
  docker build -f "${ROOT_DIR}/apps/workspace/Dockerfile" -t "${image_uri}" -t "${LOCAL_IMAGE_TAG}" "${ROOT_DIR}/apps/workspace"

  info "pushing workspace image ${image_uri}"
  docker push "${image_uri}"

  if [[ "${PRUNE_DANGLING_WORKSPACE_IMAGES}" == "true" ]]; then
    docker image prune -f \
      --filter "dangling=true" \
      --filter "label=org.gitarena.component=workspace-base" >/dev/null 2>&1 || true
  fi

  pass "workspace image pushed (${image_uri})"
  pass "local image tag available (${LOCAL_IMAGE_TAG})"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
    usage
    return
  fi
  if [[ $# -gt 0 ]]; then
    fail "unexpected arguments: $* (this script is env-driven; use --help)"
  fi

  need_cmd gcloud
  need_cmd kubectl

  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"
  [[ "${GKE_MODE}" == "standard" || "${GKE_MODE}" == "autopilot" ]] || fail "GKE_MODE must be 'standard' or 'autopilot'"
  require_bool CREATE_CLUSTER "${CREATE_CLUSTER}"
  require_bool ENABLE_NETWORK_POLICY "${ENABLE_NETWORK_POLICY}"
  require_bool CREATE_GVISOR_POOL "${CREATE_GVISOR_POOL}"
  require_bool FETCH_CREDENTIALS "${FETCH_CREDENTIALS}"
  require_bool ENSURE_NAMESPACES "${ENSURE_NAMESPACES}"
  require_bool APPLY_API_RBAC "${APPLY_API_RBAC}"
  require_bool APPLY_SESSION_NETWORK_POLICY "${APPLY_SESSION_NETWORK_POLICY}"
  require_bool ENSURE_RUNTIMECLASS "${ENSURE_RUNTIMECLASS}"
  require_bool PUSH_IMAGE "${PUSH_IMAGE}"
  require_bool PRUNE_DANGLING_WORKSPACE_IMAGES "${PRUNE_DANGLING_WORKSPACE_IMAGES}"

  ensure_project_and_services
  ensure_cluster
  fetch_credentials
  ensure_network_policy_enabled
  ensure_gvisor_pool
  ensure_runtimeclass
  ensure_namespaces
  apply_api_rbac
  apply_session_network_policy
  push_workspace_image_if_requested

  pass "GCP init complete"
  info "next: run scripts/gcp-verify.sh"
}

main "$@"
