#!/usr/bin/env bash
set -Eeuo pipefail

# Unified GCP bootstrap script for GitArena verification environments.
# Creates/updates cluster prerequisites, optional workspace image push, and
# applies core Kubernetes manifests required for policy verification.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
AR_LOCATION="${AR_LOCATION:-us-central1}"
AR_REPOSITORY="${AR_REPOSITORY:-gitarena}"
IMAGE_TAG="${IMAGE_TAG:-2.43.7-alpine3.19-v1}"
LOCAL_IMAGE_TAG="${LOCAL_IMAGE_TAG:-gitarena-base:${IMAGE_TAG}}"
PRUNE_DANGLING_WORKSPACE_IMAGES="${PRUNE_DANGLING_WORKSPACE_IMAGES:-true}"

SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"

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

ensure_project_and_services() {
  info "setting active gcloud project to ${GCP_PROJECT_ID}"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

  info "ensuring required Google APIs are enabled"
  gcloud services enable container.googleapis.com artifactregistry.googleapis.com >/dev/null
  pass "required Google APIs are enabled"
}

ensure_cluster() {
  local location_arg
  location_arg="$(cluster_flag)"

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
  location_arg="$(cluster_flag)"

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
  location_arg="$(cluster_flag)"

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
  location_arg="$(cluster_flag)"

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
  image_uri="${AR_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}/gitarena-base:${IMAGE_TAG}"

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
  need_cmd gcloud
  need_cmd kubectl

  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"
  [[ "${GKE_MODE}" == "standard" || "${GKE_MODE}" == "autopilot" ]] || fail "GKE_MODE must be 'standard' or 'autopilot'"

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
