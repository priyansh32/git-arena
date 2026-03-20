#!/usr/bin/env bash
set -Eeuo pipefail

# Unified local development startup script.
# Usage:
#   ./scripts/dev-up.sh postgres
#   ./scripts/dev-up.sh api docker
#   ./scripts/dev-up.sh api k8s
#   ./scripts/dev-up.sh web
#   ./scripts/dev-up.sh all docker
#   ./scripts/dev-up.sh all k8s
#
# Notes:
# - In k8s mode, if WORKSPACE_IMAGE is not set, the script resolves it from:
#   GCP_PROJECT_ID + WORKSPACE_AR_LOCATION/WORKSPACE_AR_REPOSITORY/WORKSPACE_IMAGE_TAG.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/common.sh"
ENV_FILE="${ROOT_DIR}/.env"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"

TARGET="${1:-all}" # postgres|api|web|all
MODE="${2:-docker}" # docker|k8s for api/all

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

ensure_env_file() {
  [[ -f "${ENV_FILE}" ]] || fail "missing .env at ${ENV_FILE}"
}

start_postgres() {
  cd "${ROOT_DIR}"
  info "starting postgres via docker compose"
  docker compose up -d postgres

  info "waiting for postgres health"
  for _ in {1..30}; do
    if docker compose exec -T postgres pg_isready -U gitarena -d gitarena >/dev/null 2>&1; then
      pass "postgres is healthy"
      return
    fi
    sleep 1
  done

  fail "postgres health check did not report healthy within 30s"
}

set_common_api_env() {
  ensure_env_file

  export API_PORT="${API_PORT:-$(read_env API_PORT 3001)}"
  export WEB_PORT="${WEB_PORT:-$(read_env WEB_PORT 5173)}"
  export PORT="${PORT:-${API_PORT}}"

  export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(read_env GOOGLE_CLIENT_ID)}"
  [[ -n "${GOOGLE_CLIENT_ID}" ]] || fail "GOOGLE_CLIENT_ID is required"

  export DATABASE_URL="${DATABASE_URL:-postgres://gitarena:gitarena@localhost:5432/gitarena}"
  export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${WEB_PORT}}"
  export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-$(read_env SESSION_COOKIE_NAME gitarena_session)}"
  export SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-$(read_env SESSION_TTL_HOURS 168)}"

  export WORKSPACE_SHELL="${WORKSPACE_SHELL:-$(read_env WORKSPACE_SHELL /bin/bash)}"
}

set_api_mode_env() {
  if [[ "${MODE}" == "docker" ]]; then
    export WORKSPACE_PROVIDER="docker"
    export WORKSPACE_IMAGE="${WORKSPACE_IMAGE:-$(read_env WORKSPACE_IMAGE gitarena-base:${GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT})}"
    export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(read_env WORKSPACE_ROOT /workspace)}"
    export WORKSPACE_CONTAINER_PREFIX="${WORKSPACE_CONTAINER_PREFIX:-$(read_env WORKSPACE_CONTAINER_PREFIX gitarena-ws)}"
    export WORKSPACE_INIT_COMMAND="${WORKSPACE_INIT_COMMAND:-$(read_env WORKSPACE_INIT_COMMAND 'mkdir -p /workspace && cd /workspace && exec tail -f /dev/null')}"
    return
  fi

  [[ "${MODE}" == "k8s" ]] || fail "api mode must be docker or k8s"
  command -v kubectl >/dev/null 2>&1 || fail "kubectl is required for k8s mode"
  kubectl config current-context >/dev/null 2>&1 || fail "kubectl context is not configured"

  export USE_GKE_GCLOUD_AUTH_PLUGIN="${USE_GKE_GCLOUD_AUTH_PLUGIN:-True}"
  export WORKSPACE_PROVIDER="kubernetes"

  if [[ -n "${WORKSPACE_IMAGE:-}" ]]; then
    export WORKSPACE_IMAGE
  else
    local image_from_env gcp_project_id image_location image_repository image_tag
    image_from_env="$(read_env WORKSPACE_IMAGE)"
    if [[ -n "${image_from_env}" && "${image_from_env}" == */* ]]; then
      export WORKSPACE_IMAGE="${image_from_env}"
    else
      gcp_project_id="${GCP_PROJECT_ID:-$(read_env GCP_PROJECT_ID)}"
      image_location="${WORKSPACE_AR_LOCATION:-$(read_env WORKSPACE_AR_LOCATION ${GITARENA_AR_LOCATION_DEFAULT})}"
      image_repository="${WORKSPACE_AR_REPOSITORY:-$(read_env WORKSPACE_AR_REPOSITORY ${GITARENA_AR_REPOSITORY_DEFAULT})}"
      image_tag="${WORKSPACE_IMAGE_TAG:-$(read_env WORKSPACE_IMAGE_TAG ${GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT})}"

      if [[ -z "${gcp_project_id}" ]]; then
        fail "k8s mode requires WORKSPACE_IMAGE (full image ref) or GCP_PROJECT_ID in env/.env"
      fi

      export WORKSPACE_IMAGE="$(workspace_image_ref "${gcp_project_id}" "${image_location}" "${image_repository}" "${image_tag}")"
    fi
  fi

  export WORKSPACE_K8S_NAMESPACE="${WORKSPACE_K8S_NAMESPACE:-$(read_env WORKSPACE_K8S_NAMESPACE ${GITARENA_SESSIONS_NAMESPACE_DEFAULT})}"
  export WORKSPACE_K8S_RUNTIME_CLASS_NAME="${WORKSPACE_K8S_RUNTIME_CLASS_NAME:-$(read_env WORKSPACE_K8S_RUNTIME_CLASS_NAME gvisor)}"
  export WORKSPACE_K8S_IMAGE_PULL_POLICY="${WORKSPACE_K8S_IMAGE_PULL_POLICY:-$(read_env WORKSPACE_K8S_IMAGE_PULL_POLICY IfNotPresent)}"
  export WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS="${WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS:-$(read_env WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS 240)}"
}

start_api_foreground() {
  set_common_api_env
  set_api_mode_env
  cd "${ROOT_DIR}"
  info "starting API with WORKSPACE_PROVIDER=${WORKSPACE_PROVIDER} on http://localhost:${PORT}"
  exec npm run dev:api
}

start_web_foreground() {
  ensure_env_file
  export API_PORT="${API_PORT:-$(read_env API_PORT 3001)}"
  export WEB_PORT="${WEB_PORT:-$(read_env WEB_PORT 5173)}"
  export VITE_API_PROXY_HOST="${VITE_API_PROXY_HOST:-$(read_env VITE_API_PROXY_HOST localhost)}"
  export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://${VITE_API_PROXY_HOST}:${API_PORT}}"
  export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(read_env VITE_GOOGLE_CLIENT_ID)}"
  [[ -n "${VITE_GOOGLE_CLIENT_ID}" ]] || fail "VITE_GOOGLE_CLIENT_ID is required"

  cd "${ROOT_DIR}"
  info "starting web dev server on http://localhost:${WEB_PORT} (proxy -> ${VITE_API_PROXY_TARGET})"
  exec npm run dev:web
}

stop_pidfile_if_running() {
  local pidfile="$1"
  if [[ ! -f "${pidfile}" ]]; then
    return
  fi

  local pid
  pid="$(cat "${pidfile}" 2>/dev/null || true)"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${pidfile}"
}

start_api_background() {
  mkdir -p "${RUNTIME_DIR}"
  stop_pidfile_if_running "${RUNTIME_DIR}/api.pid"

  (
    set_common_api_env
    set_api_mode_env
    cd "${ROOT_DIR}"
    nohup npm run dev:api >"${RUNTIME_DIR}/api.log" 2>&1 &
    echo $! >"${RUNTIME_DIR}/api.pid"
  )

  pass "API started in background (log: ${RUNTIME_DIR}/api.log)"
}

start_web_background() {
  mkdir -p "${RUNTIME_DIR}"
  stop_pidfile_if_running "${RUNTIME_DIR}/web.pid"

  (
    ensure_env_file
    export API_PORT="${API_PORT:-$(read_env API_PORT 3001)}"
    export WEB_PORT="${WEB_PORT:-$(read_env WEB_PORT 5173)}"
    export VITE_API_PROXY_HOST="${VITE_API_PROXY_HOST:-$(read_env VITE_API_PROXY_HOST localhost)}"
    export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://${VITE_API_PROXY_HOST}:${API_PORT}}"
    export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(read_env VITE_GOOGLE_CLIENT_ID)}"
    [[ -n "${VITE_GOOGLE_CLIENT_ID}" ]] || fail "VITE_GOOGLE_CLIENT_ID is required"
    cd "${ROOT_DIR}"
    nohup npm run dev:web >"${RUNTIME_DIR}/web.log" 2>&1 &
    echo $! >"${RUNTIME_DIR}/web.pid"
  )

  pass "web started in background (log: ${RUNTIME_DIR}/web.log)"
}

start_all() {
  start_postgres
  start_api_background
  start_web_background
  info "all local dev services started"
  info "web: http://localhost:${WEB_PORT:-5173} | api: http://localhost:${API_PORT:-3001}"
  info "tail logs: tail -f ${RUNTIME_DIR}/api.log ${RUNTIME_DIR}/web.log"
}

main() {
  case "${TARGET}" in
    postgres)
      start_postgres
      ;;
    api)
      start_api_foreground
      ;;
    web)
      start_web_foreground
      ;;
    all)
      start_all
      ;;
    *)
      fail "invalid target '${TARGET}' (use: postgres|api|web|all)"
      ;;
  esac
}

main "$@"
