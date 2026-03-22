#!/usr/bin/env bash
set -Eeuo pipefail

# Unified local development startup script (local-only).
# Usage:
#   ./scripts/dev-up.sh postgres
#   ./scripts/dev-up.sh api docker
#   ./scripts/dev-up.sh web
#   ./scripts/dev-up.sh all docker

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/common.sh"
ENV_FILE="${ROOT_DIR}/.env"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"
DEFAULT_DATABASE_URL="postgres://gitarena:gitarena@localhost:5432/gitarena"

TARGET="${1:-all}" # postgres|api|web|all
MODE="${2:-docker}" # docker only (compat arg for api/all)

usage() {
  cat <<'EOF'
Usage:
  ./scripts/dev-up.sh [target] [mode]

Targets:
  postgres           start postgres only (docker compose)
  api [docker]       start API in foreground
  web                start web in foreground
  all [docker]       start API + web in background (starts postgres)

Options:
  -h, --help         show this message

Notes:
  - Local dev mode supports docker workspace backend only.
  - Host-dev ports come from DEV_API_PORT/DEV_WEB_PORT (defaults: 3002/5174).
EOF
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

ensure_env_file() {
  [[ -f "${ENV_FILE}" ]] || fail "missing .env at ${ENV_FILE}"
}

listener_pids_for_port() {
  local port="$1"
  ss -ltnp "sport = :${port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
}

assert_port_free() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(listener_pids_for_port "${port}")"

  if [[ -z "${pids}" ]]; then
    return
  fi

  fail "${label} port :${port} is already in use (pid(s): ${pids}). Run ./scripts/dev-down.sh all and retry."
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
  local dev_api_port dev_web_port

  ensure_env_file

  dev_api_port="${DEV_API_PORT:-$(read_env DEV_API_PORT 3002)}"
  dev_web_port="${DEV_WEB_PORT:-$(read_env DEV_WEB_PORT 5174)}"

  export DEV_API_PORT="${dev_api_port}"
  export DEV_WEB_PORT="${dev_web_port}"
  export API_PORT="${dev_api_port}"
  export WEB_PORT="${dev_web_port}"
  export PORT="${API_PORT}"

  export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(read_env GOOGLE_CLIENT_ID)}"
  [[ -n "${GOOGLE_CLIENT_ID}" ]] || fail "GOOGLE_CLIENT_ID is required"

  export DATABASE_URL="${DATABASE_URL:-$(read_env DATABASE_URL ${DEFAULT_DATABASE_URL})}"

  export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${WEB_PORT}}"
  export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-$(read_env SESSION_COOKIE_NAME gitarena_session)}"
  export SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-$(read_env SESSION_TTL_HOURS 168)}"
  export AUTH_TEST_MODE="${AUTH_TEST_MODE:-$(read_env AUTH_TEST_MODE false)}"
  export AUTH_TEST_ALLOWED_EMAILS="${AUTH_TEST_ALLOWED_EMAILS:-$(read_env AUTH_TEST_ALLOWED_EMAILS '')}"

  export WORKSPACE_SHELL="${WORKSPACE_SHELL:-$(read_env WORKSPACE_SHELL /bin/bash)}"
}

set_api_mode_env() {
  [[ "${MODE}" == "docker" ]] || fail "mode must be docker for local dev"

  export WORKSPACE_PROVIDER="docker"
  export WORKSPACE_IMAGE="${WORKSPACE_IMAGE:-$(read_env WORKSPACE_IMAGE gitarena-base:${GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT})}"
  export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(read_env WORKSPACE_ROOT /workspace)}"
  export WORKSPACE_CONTAINER_PREFIX="${WORKSPACE_CONTAINER_PREFIX:-$(read_env WORKSPACE_CONTAINER_PREFIX gitarena-ws)}"
  export WORKSPACE_INIT_COMMAND="${WORKSPACE_INIT_COMMAND:-$(read_env WORKSPACE_INIT_COMMAND 'mkdir -p /workspace && cd /workspace && exec tail -f /dev/null')}"
}

start_api_foreground() {
  set_common_api_env
  set_api_mode_env
  assert_port_free "${PORT}" "api"
  cd "${ROOT_DIR}"
  info "starting API with WORKSPACE_PROVIDER=${WORKSPACE_PROVIDER} on http://localhost:${PORT}"
  exec npm run dev:api
}

start_web_foreground() {
  local dev_api_port dev_web_port
  ensure_env_file
  dev_api_port="${DEV_API_PORT:-$(read_env DEV_API_PORT 3002)}"
  dev_web_port="${DEV_WEB_PORT:-$(read_env DEV_WEB_PORT 5174)}"
  export DEV_API_PORT="${dev_api_port}"
  export DEV_WEB_PORT="${dev_web_port}"
  export API_PORT="${dev_api_port}"
  export WEB_PORT="${dev_web_port}"
  export VITE_API_PROXY_HOST="${VITE_API_PROXY_HOST:-$(read_env VITE_API_PROXY_HOST localhost)}"
  export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://${VITE_API_PROXY_HOST}:${API_PORT}}"
  export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(read_env VITE_GOOGLE_CLIENT_ID)}"
  [[ -n "${VITE_GOOGLE_CLIENT_ID}" ]] || fail "VITE_GOOGLE_CLIENT_ID is required"
  assert_port_free "${WEB_PORT}" "web"

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
    assert_port_free "${PORT}" "api"
    cd "${ROOT_DIR}"
    nohup npm run dev:api >"${RUNTIME_DIR}/api.log" 2>&1 &
    echo $! >"${RUNTIME_DIR}/api.pid"
  )

  pass "API started in background (log: ${RUNTIME_DIR}/api.log)"
}

start_web_background() {
  local dev_api_port dev_web_port
  mkdir -p "${RUNTIME_DIR}"
  stop_pidfile_if_running "${RUNTIME_DIR}/web.pid"

  (
    ensure_env_file
    dev_api_port="${DEV_API_PORT:-$(read_env DEV_API_PORT 3002)}"
    dev_web_port="${DEV_WEB_PORT:-$(read_env DEV_WEB_PORT 5174)}"
    export DEV_API_PORT="${dev_api_port}"
    export DEV_WEB_PORT="${dev_web_port}"
    export API_PORT="${dev_api_port}"
    export WEB_PORT="${dev_web_port}"
    export VITE_API_PROXY_HOST="${VITE_API_PROXY_HOST:-$(read_env VITE_API_PROXY_HOST localhost)}"
    export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://${VITE_API_PROXY_HOST}:${API_PORT}}"
    export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(read_env VITE_GOOGLE_CLIENT_ID)}"
    [[ -n "${VITE_GOOGLE_CLIENT_ID}" ]] || fail "VITE_GOOGLE_CLIENT_ID is required"
    assert_port_free "${WEB_PORT}" "web"
    cd "${ROOT_DIR}"
    nohup npm run dev:web >"${RUNTIME_DIR}/web.log" 2>&1 &
    echo $! >"${RUNTIME_DIR}/web.pid"
  )

  pass "web started in background (log: ${RUNTIME_DIR}/web.log)"
}

start_all() {
  local web_port_display api_port_display
  api_port_display="${DEV_API_PORT:-$(read_env DEV_API_PORT 3002)}"
  web_port_display="${DEV_WEB_PORT:-$(read_env DEV_WEB_PORT 5174)}"

  set_common_api_env
  start_postgres

  start_api_background
  start_web_background
  info "all local dev services started"
  info "web: http://localhost:${web_port_display} | api: http://localhost:${api_port_display}"
  info "tail logs: tail -f ${RUNTIME_DIR}/api.log ${RUNTIME_DIR}/web.log"
}

main() {
  if [[ "${TARGET}" == "-h" || "${TARGET}" == "--help" || "${TARGET}" == "help" ]]; then
    usage
    return
  fi

  case "${TARGET}" in
    api|all)
      [[ "${MODE}" == "docker" ]] || fail "mode must be docker for target '${TARGET}'"
      ;;
    postgres|web)
      if [[ $# -gt 1 ]]; then
        fail "mode argument is only supported for targets 'api' and 'all'"
      fi
      ;;
    *)
      ;;
  esac

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
