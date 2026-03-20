#!/usr/bin/env bash
set -Eeuo pipefail

# Verification-only automation for Phase 3 policy checks.
# Applies network policy, deploys verification pods, and validates ingress/egress behavior.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POD_TEMPLATE="${ROOT_DIR}/deploy/k8s/challenge-session-pod.yaml"
NETWORK_POLICY_MANIFEST="${ROOT_DIR}/deploy/k8s/session-isolation-networkpolicy.yaml"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GKE_CLUSTER_NAME="${GKE_CLUSTER_NAME:-gitarena-verify-1}"
GKE_LOCATION="${GKE_LOCATION:-us-central1-a}"
GKE_LOCATION_TYPE="${GKE_LOCATION_TYPE:-zone}" # zone|region
FETCH_CREDENTIALS="${FETCH_CREDENTIALS:-true}"

IMAGE_PROJECT_ID="${IMAGE_PROJECT_ID:-${GCP_PROJECT_ID}}"
SESSION_PREFIX="${SESSION_PREFIX:-phase3-verify}"
USER_ID="${USER_ID:-verify-user}"
SCENARIO_ID="${SCENARIO_ID:-detached-head-recovery}"

SESSIONS_NS="gitarena-sessions"
API_NS="gitarena-api"
CHALLENGE_A="session-${SESSION_PREFIX}-a"
INGRESS_TARGET_POD="challenge-ingress-phase3-verify"
API_BACKEND_POD="api-backend-phase3-verify"
API_OTHER_POD="api-other-phase3-verify"

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

fetch_credentials() {
  if [[ "${FETCH_CREDENTIALS}" != "true" ]]; then
    return
  fi

  [[ -n "${GCP_PROJECT_ID}" ]] || fail "set GCP_PROJECT_ID when FETCH_CREDENTIALS=true"

  local location_arg
  location_arg="$(cluster_flag)"

  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
  info "fetching kube credentials for cluster '${GKE_CLUSTER_NAME}'"
  gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" "${location_arg}" >/dev/null
}

ensure_namespaces() {
  kubectl create namespace "${SESSIONS_NS}" --dry-run=client -o yaml | kubectl apply -f -
  kubectl create namespace "${API_NS}" --dry-run=client -o yaml | kubectl apply -f -
  pass "required namespaces exist"
}

check_api_backend_label_contract() {
  local count
  count="$(kubectl -n "${API_NS}" get pods -l app=api-backend --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')"

  if [[ "${count}" == "0" ]]; then
    warn "no running pods found with label app=api-backend in namespace ${API_NS}; verification will create temporary probe pod with required label"
    return
  fi

  pass "found running api-backend pods in namespace ${API_NS}"
}

apply_network_policy() {
  [[ -f "${NETWORK_POLICY_MANIFEST}" ]] || fail "network policy manifest not found: ${NETWORK_POLICY_MANIFEST}"
  kubectl apply -f "${NETWORK_POLICY_MANIFEST}" >/dev/null
  pass "network policy applied"
}

deploy_api_probe_pods() {
  kubectl -n "${API_NS}" delete pod "${API_BACKEND_POD}" "${API_OTHER_POD}" --ignore-not-found --wait=true >/dev/null 2>&1 || true

  kubectl apply -f - <<YAML >/dev/null
apiVersion: v1
kind: Pod
metadata:
  name: ${API_BACKEND_POD}
  namespace: ${API_NS}
  labels:
    app: api-backend
spec:
  restartPolicy: Never
  containers:
    - name: toolbox
      image: busybox:1.36
      command: ["sh", "-lc", "sleep 3600"]
---
apiVersion: v1
kind: Pod
metadata:
  name: ${API_OTHER_POD}
  namespace: ${API_NS}
  labels:
    app: api-other
spec:
  restartPolicy: Never
  containers:
    - name: toolbox
      image: busybox:1.36
      command: ["sh", "-lc", "sleep 3600"]
YAML

  kubectl -n "${API_NS}" wait --for=condition=Ready "pod/${API_BACKEND_POD}" --timeout=180s >/dev/null || fail "api backend probe pod did not become ready"
  kubectl -n "${API_NS}" wait --for=condition=Ready "pod/${API_OTHER_POD}" --timeout=180s >/dev/null || fail "api other probe pod did not become ready"
  pass "api probe pods are ready"
}

deploy_challenge_pods() {
  [[ -f "${POD_TEMPLATE}" ]] || fail "pod template not found: ${POD_TEMPLATE}"
  [[ -n "${IMAGE_PROJECT_ID}" ]] || fail "set IMAGE_PROJECT_ID or GCP_PROJECT_ID"

  kubectl -n "${SESSIONS_NS}" delete pod "${CHALLENGE_A}" --ignore-not-found --wait=true >/dev/null 2>&1 || true

  export USER_ID SCENARIO_ID

  SESSION_ID="${SESSION_PREFIX}-a" GCP_PROJECT_ID="${IMAGE_PROJECT_ID}" envsubst < "${POD_TEMPLATE}" | kubectl apply -f - >/dev/null

  kubectl -n "${SESSIONS_NS}" wait --for=condition=Ready "pod/${CHALLENGE_A}" --timeout=240s >/dev/null || fail "challenge pod A did not become ready"
  pass "challenge pod is ready"
}

deploy_ingress_target_pod() {
  kubectl -n "${SESSIONS_NS}" delete pod "${INGRESS_TARGET_POD}" --ignore-not-found --wait=true >/dev/null 2>&1 || true

  kubectl apply -f - <<YAML >/dev/null
apiVersion: v1
kind: Pod
metadata:
  name: ${INGRESS_TARGET_POD}
  namespace: ${SESSIONS_NS}
  labels:
    app: challenge-session
spec:
  restartPolicy: Never
  containers:
    - name: server
      image: busybox:1.36
      command: ["sh", "-lc", "echo ok >/tmp/index.html && httpd -f -p 7681 -h /tmp"]
      ports:
        - containerPort: 7681
          protocol: TCP
YAML

  kubectl -n "${SESSIONS_NS}" wait --for=condition=Ready "pod/${INGRESS_TARGET_POD}" --timeout=180s >/dev/null || fail "ingress target pod did not become ready"
  pass "ingress target pod is ready"
}

expect_fail() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "${label}: command unexpectedly succeeded"
  fi
  pass "${label}"
}

expect_success() {
  local label="$1"
  shift
  if ! "$@" >/dev/null 2>&1; then
    fail "${label}: command failed unexpectedly"
  fi
  pass "${label}"
}

run_network_checks() {
  local challenge_a_ip ingress_target_ip
  challenge_a_ip="$(kubectl -n "${SESSIONS_NS}" get pod "${CHALLENGE_A}" -o jsonpath='{.status.podIP}')"
  ingress_target_ip="$(kubectl -n "${SESSIONS_NS}" get pod "${INGRESS_TARGET_POD}" -o jsonpath='{.status.podIP}')"

  [[ -n "${challenge_a_ip}" ]] || fail "unable to resolve challenge pod A IP"
  [[ -n "${ingress_target_ip}" ]] || fail "unable to resolve ingress target pod IP"

  expect_success \
    "ingress from app=api-backend pod is allowed on 7681" \
    kubectl -n "${API_NS}" exec "${API_BACKEND_POD}" -- sh -lc "wget -q -O /dev/null -T 3 http://${ingress_target_ip}:7681/"

  if kubectl -n "${API_NS}" exec "${API_OTHER_POD}" -- sh -lc "wget -q -O /dev/null -T 3 http://${ingress_target_ip}:7681/" >/dev/null 2>&1; then
    fail "ingress from non-api pod is blocked on 7681: command unexpectedly succeeded (this usually means NetworkPolicy is not enforced by cluster CNI)"
  fi
  pass "ingress from non-api pod is blocked on 7681"

  expect_fail \
    "outbound internet from challenge pod is blocked" \
    kubectl -n "${SESSIONS_NS}" exec "${CHALLENGE_A}" -- sh -lc "curl -fsS --connect-timeout 5 https://example.com >/dev/null"

  expect_fail \
    "inter-session pod traffic is blocked" \
    kubectl -n "${SESSIONS_NS}" exec "${CHALLENGE_A}" -- bash -lc "timeout 5 bash -lc 'echo > /dev/tcp/${ingress_target_ip}/7681'"
}

main() {
  need_cmd kubectl
  need_cmd envsubst
  if [[ "${FETCH_CREDENTIALS}" == "true" ]]; then
    need_cmd gcloud
  fi

  fetch_credentials
  ensure_namespaces
  check_api_backend_label_contract
  apply_network_policy
  deploy_api_probe_pods
  deploy_challenge_pods
  deploy_ingress_target_pod
  run_network_checks

  info "Phase 3 verification complete"
  info "run scripts/delete-phase3-gke.sh to remove phase3 verification resources"
}

main "$@"
