#!/usr/bin/env bash
set -Eeuo pipefail

# Verification-only automation for Phase 2 policy checks.
# For clean lifecycle separation, initialize infrastructure first via:
#   ./scripts/gcp-init.sh
# Then run this script only for security verification.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POD_TEMPLATE="${ROOT_DIR}/deploy/k8s/challenge-session-pod.yaml"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
GKE_MODE="${GKE_MODE:-standard}" # standard|autopilot

CREATE_CLUSTER="${CREATE_CLUSTER:-false}"
CREATE_GVISOR_POOL="${CREATE_GVISOR_POOL:-false}" # standard mode only
SANDBOX_POOL_NAME="${SANDBOX_POOL_NAME:-sandbox-pool}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"
IMAGE_PUSH_LOCATION="${IMAGE_PUSH_LOCATION:-us-central1}"
IMAGE_PUSH_REPOSITORY="${IMAGE_PUSH_REPOSITORY:-gitarena}"
IMAGE_PUSH_TAG="${IMAGE_PUSH_TAG:-2.43.7-alpine3.19-v1}"

MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-2}"
DISK_TYPE="${DISK_TYPE:-pd-standard}"
DISK_SIZE_GB="${DISK_SIZE_GB:-30}"

SESSION_ID="${SESSION_ID:-phase2-verify}"
USER_ID="${USER_ID:-verify-user}"
SCENARIO_ID="${SCENARIO_ID:-detached-head-recovery}"

IMAGE_PROJECT_ID="${IMAGE_PROJECT_ID:-${GCP_PROJECT_ID}}"
POD_NAME="session-${SESSION_ID}"
SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"

info() {
  printf 'INFO: %s\n' "$1"
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

expect_eq() {
  local label="$1"
  local got="$2"
  local expected="$3"
  if [[ "${got}" != "${expected}" ]]; then
    fail "${label}: expected '${expected}', got '${got}'"
  fi
  pass "${label}"
}

ensure_cluster() {
  local location_arg
  location_arg="$(cluster_flag)"

  if gcloud container clusters describe "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null 2>&1; then
    info "cluster '${GKE_CLUSTER_NAME}' already exists"
  else
    if [[ "${CREATE_CLUSTER}" != "true" ]]; then
      fail "cluster '${GKE_CLUSTER_NAME}' does not exist and CREATE_CLUSTER=false"
    fi

    info "creating ${GKE_MODE} cluster '${GKE_CLUSTER_NAME}' (${GKE_LOCATION_TYPE}=${GKE_LOCATION})"
    if [[ "${GKE_MODE}" == "autopilot" ]]; then
      gcloud container clusters create-auto "${GKE_CLUSTER_NAME}" "${location_arg}"
    else
      gcloud container clusters create "${GKE_CLUSTER_NAME}" \
        "${location_arg}" \
        --num-nodes=1 \
        --machine-type="${MACHINE_TYPE}" \
        --disk-type="${DISK_TYPE}" \
        --disk-size="${DISK_SIZE_GB}"
    fi
  fi

  info "fetching kube credentials"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}"

  if [[ "${GKE_MODE}" == "standard" && "${CREATE_GVISOR_POOL}" == "true" ]]; then
    if gcloud container node-pools describe "${SANDBOX_POOL_NAME}" \
      --cluster "${GKE_CLUSTER_NAME}" \
      "${location_arg}" >/dev/null 2>&1; then
      info "gVisor node pool '${SANDBOX_POOL_NAME}' already exists"
    else
      info "creating gVisor node pool '${SANDBOX_POOL_NAME}'"
      gcloud container node-pools create "${SANDBOX_POOL_NAME}" \
        --cluster "${GKE_CLUSTER_NAME}" \
        "${location_arg}" \
        --num-nodes=1 \
        --machine-type="${MACHINE_TYPE}" \
        --disk-type="${DISK_TYPE}" \
        --disk-size="${DISK_SIZE_GB}" \
        --sandbox type=gvisor
    fi
  fi
}

ensure_runtimeclass() {
  if kubectl get runtimeclass gvisor >/dev/null 2>&1; then
    pass "runtimeclass/gvisor exists"
    return
  fi

  info "runtimeclass/gvisor missing; applying fallback runtimeclass manifest"
  kubectl apply -f - <<'YAML'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
YAML
  pass "runtimeclass/gvisor applied"
}

ensure_namespaces() {
  kubectl create namespace "${SESSIONS_NS}" --dry-run=client -o yaml | kubectl apply -f -
  kubectl create namespace "${API_NS}" --dry-run=client -o yaml | kubectl apply -f -
  pass "required namespaces exist"
}

push_workspace_image_if_requested() {
  if [[ "${PUSH_IMAGE}" != "true" ]]; then
    return
  fi

  info "PUSH_IMAGE=true, building and pushing workspace image"
  GCP_PROJECT_ID="${IMAGE_PROJECT_ID}" \
    AR_LOCATION="${IMAGE_PUSH_LOCATION}" \
    AR_REPOSITORY="${IMAGE_PUSH_REPOSITORY}" \
    IMAGE_TAG="${IMAGE_PUSH_TAG}" \
    "${ROOT_DIR}/scripts/push-workspace-image-gcp.sh"
}

deploy_verification_pod() {
  [[ -f "${POD_TEMPLATE}" ]] || fail "pod template not found: ${POD_TEMPLATE}"
  export SESSION_ID USER_ID SCENARIO_ID GCP_PROJECT_ID="${IMAGE_PROJECT_ID}"

  info "deploying verification pod '${POD_NAME}'"
  envsubst < "${POD_TEMPLATE}" | kubectl apply -f -

  info "waiting for pod readiness"
  if ! kubectl -n "${SESSIONS_NS}" wait --for=condition=Ready "pod/${POD_NAME}" --timeout=240s; then
    kubectl -n "${SESSIONS_NS}" describe pod "${POD_NAME}" || true
    fail "verification pod did not become ready"
  fi
  pass "verification pod is ready"
}

check_manifest_security_fields() {
  local got

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.runtimeClassName}')"
  expect_eq "runtimeClassName" "${got}" "gvisor"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.automountServiceAccountToken}')"
  expect_eq "automountServiceAccountToken" "${got}" "false"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.enableServiceLinks}')"
  expect_eq "enableServiceLinks" "${got}" "false"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.securityContext.runAsNonRoot}')"
  expect_eq "runAsNonRoot" "${got}" "true"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.securityContext.runAsUser}')"
  expect_eq "runAsUser" "${got}" "1000"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.securityContext.runAsGroup}')"
  expect_eq "runAsGroup" "${got}" "1000"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.securityContext.fsGroup}')"
  expect_eq "fsGroup" "${got}" "1000"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.securityContext.seccompProfile.type}')"
  expect_eq "seccompProfile.type" "${got}" "RuntimeDefault"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].securityContext.allowPrivilegeEscalation}')"
  expect_eq "allowPrivilegeEscalation" "${got}" "false"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].resources.requests.memory}')"
  expect_eq "resources.requests.memory" "${got}" "128Mi"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].resources.requests.cpu}')"
  expect_eq "resources.requests.cpu" "${got}" "250m"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].resources.limits.memory}')"
  expect_eq "resources.limits.memory" "${got}" "256Mi"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].resources.limits.cpu}')"
  expect_eq "resources.limits.cpu" "${got}" "500m"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.containers[0].resources.limits.ephemeral-storage}')"
  expect_eq "resources.limits.ephemeral-storage" "${got}" "1Gi"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.restartPolicy}')"
  expect_eq "restartPolicy" "${got}" "Never"

  got="$(kubectl -n "${SESSIONS_NS}" get pod "${POD_NAME}" -o jsonpath='{.spec.terminationGracePeriodSeconds}')"
  expect_eq "terminationGracePeriodSeconds" "${got}" "10"
}

check_runtime_behavior() {
  local uid gid cap_eff

  uid="$(kubectl -n "${SESSIONS_NS}" exec "${POD_NAME}" -- id -u)"
  expect_eq "runtime uid" "${uid}" "1000"

  gid="$(kubectl -n "${SESSIONS_NS}" exec "${POD_NAME}" -- id -g)"
  expect_eq "runtime gid" "${gid}" "1000"

  cap_eff="$(kubectl -n "${SESSIONS_NS}" exec "${POD_NAME}" -- sh -lc 'awk "/^CapEff:/ {print \$2}" /proc/1/status')"
  if [[ ! "${cap_eff}" =~ ^0+$ ]]; then
    fail "CapEff is not zeroed: ${cap_eff}"
  fi
  pass "effective capabilities are dropped"

  if kubectl -n "${SESSIONS_NS}" exec "${POD_NAME}" -- sh -lc 'mkdir -p /tmp/mnt && mount -t tmpfs tmpfs /tmp/mnt' >/dev/null 2>&1; then
    fail "privileged mount unexpectedly succeeded"
  fi
  pass "privileged mount attempt fails"
}

main() {
  need_cmd gcloud
  need_cmd kubectl
  need_cmd envsubst

  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID"
  [[ "${GKE_LOCATION_TYPE}" == "zone" || "${GKE_LOCATION_TYPE}" == "region" ]] || fail "GKE_LOCATION_TYPE must be 'zone' or 'region'"
  [[ "${GKE_MODE}" == "standard" || "${GKE_MODE}" == "autopilot" ]] || fail "GKE_MODE must be 'standard' or 'autopilot'"

  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

  push_workspace_image_if_requested
  ensure_cluster
  ensure_runtimeclass
  ensure_namespaces
  deploy_verification_pod

  check_manifest_security_fields
  check_runtime_behavior

  info "Phase 2 verification complete for pod ${POD_NAME} in namespace ${SESSIONS_NS}"
  info "run scripts/gcp-teardown.sh to remove verification resources and optionally delete the cluster"
}

main "$@"
