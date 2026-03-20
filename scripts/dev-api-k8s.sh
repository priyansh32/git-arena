#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

read_env() {
  local key="$1"
  local fallback="${2:-}"
  local value

  value="$(grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  if [[ -z "${value}" ]]; then
    printf '%s' "${fallback}"
    return
  fi

  printf '%s' "${value}"
}

command -v kubectl >/dev/null 2>&1 || fail "kubectl is required"
kubectl config current-context >/dev/null 2>&1 || fail "kubectl context is not configured"
[[ -f "${ENV_FILE}" ]] || fail "missing .env at ${ENV_FILE}"

export USE_GKE_GCLOUD_AUTH_PLUGIN="${USE_GKE_GCLOUD_AUTH_PLUGIN:-True}"

export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(read_env GOOGLE_CLIENT_ID)}"
[[ -n "${GOOGLE_CLIENT_ID}" ]] || fail "GOOGLE_CLIENT_ID is required"

export DATABASE_URL="${DATABASE_URL:-postgres://gitarena:gitarena@localhost:5432/gitarena}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"
export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-$(read_env SESSION_COOKIE_NAME gitarena_session)}"
export SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-$(read_env SESSION_TTL_HOURS 168)}"

export WORKSPACE_PROVIDER="kubernetes"
if [[ -n "${WORKSPACE_IMAGE:-}" ]]; then
  export WORKSPACE_IMAGE
else
  IMAGE_FROM_ENV="$(read_env WORKSPACE_IMAGE)"
  if [[ -n "${IMAGE_FROM_ENV}" && "${IMAGE_FROM_ENV}" == */* ]]; then
    export WORKSPACE_IMAGE="${IMAGE_FROM_ENV}"
  else
    export WORKSPACE_IMAGE="us-central1-docker.pkg.dev/git-arena-490721/gitarena/gitarena-base:2.43.7-alpine3.19-v1"
  fi
fi
export WORKSPACE_SHELL="${WORKSPACE_SHELL:-$(read_env WORKSPACE_SHELL /bin/bash)}"
export WORKSPACE_K8S_NAMESPACE="${WORKSPACE_K8S_NAMESPACE:-$(read_env WORKSPACE_K8S_NAMESPACE gitarena-sessions)}"
export WORKSPACE_K8S_RUNTIME_CLASS_NAME="${WORKSPACE_K8S_RUNTIME_CLASS_NAME:-$(read_env WORKSPACE_K8S_RUNTIME_CLASS_NAME gvisor)}"
export WORKSPACE_K8S_IMAGE_PULL_POLICY="${WORKSPACE_K8S_IMAGE_PULL_POLICY:-$(read_env WORKSPACE_K8S_IMAGE_PULL_POLICY IfNotPresent)}"
export WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS="${WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS:-$(read_env WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS 240)}"

cd "${ROOT_DIR}"
echo "INFO: starting API with WORKSPACE_PROVIDER=kubernetes"
exec npm run dev:api
