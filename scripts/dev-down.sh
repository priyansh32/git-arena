#!/usr/bin/env bash
set -Eeuo pipefail

# Unified local development shutdown script.
# Usage:
#   ./scripts/dev-down.sh api
#   ./scripts/dev-down.sh web
#   ./scripts/dev-down.sh postgres
#   ./scripts/dev-down.sh all

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/common.sh"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"
ENV_FILE="${ROOT_DIR}/.env"
TARGET="${1:-all}" # api|web|postgres|all
FORCE_STALE_KILL="${FORCE_STALE_KILL:-true}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/dev-down.sh [target]

Targets:
  api        stop API dev process
  web        stop web dev process
  postgres   stop postgres service in docker compose
  all        stop api + web + postgres (default)

Options:
  -h, --help show this message

Env:
  FORCE_STALE_KILL=true|false  kill stale repo-owned listeners on DEV_API_PORT/DEV_WEB_PORT (default: true)
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

kill_pid_tree() {
  local pid="$1"
  if [[ -z "${pid}" ]]; then
    return
  fi

  # Try graceful shutdown first.
  pkill -TERM -P "${pid}" >/dev/null 2>&1 || true
  kill "${pid}" >/dev/null 2>&1 || true
  sleep 1

  if kill -0 "${pid}" >/dev/null 2>&1; then
    pkill -KILL -P "${pid}" >/dev/null 2>&1 || true
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
}

stop_from_pidfile() {
  local name="$1"
  local pidfile="$2"

  if [[ ! -f "${pidfile}" ]]; then
    info "${name}: no pidfile at ${pidfile}"
    return
  fi

  local pid
  pid="$(cat "${pidfile}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    rm -f "${pidfile}"
    info "${name}: empty pidfile removed"
    return
  fi

  if kill -0 "${pid}" >/dev/null 2>&1; then
    info "stopping ${name} (pid ${pid})"
    kill_pid_tree "${pid}"
    pass "${name} stop requested"
  else
    info "${name}: process ${pid} not running"
  fi

  rm -f "${pidfile}"
}

is_repo_process() {
  local pid="$1"
  local cwd cmdline

  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  if [[ -n "${cwd}" && "${cwd}" == "${ROOT_DIR}"* ]]; then
    return 0
  fi

  cmdline="$(tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null || true)"
  [[ -n "${cmdline}" && "${cmdline}" == *"${ROOT_DIR}"* ]]
}

cleanup_port_listener() {
  local port="$1"
  local label="$2"
  local pids pid

  pids="$(ss -ltnp "sport = :${port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  if [[ -z "${pids}" ]]; then
    info "${label}: no listener on :${port}"
    return
  fi

  for pid in ${pids}; do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      continue
    fi

    if is_repo_process "${pid}"; then
      info "${label}: stopping stale repo listener pid ${pid} on :${port}"
      kill_pid_tree "${pid}"
      pass "${label}: stale listener cleanup requested for pid ${pid}"
      continue
    fi

    warn "${label}: listener pid ${pid} on :${port} is not repo-owned; skipping"
  done
}

cleanup_stale_listeners() {
  local -a targets=("$@")
  if [[ "${FORCE_STALE_KILL}" != "true" ]]; then
    info "skipping stale listener cleanup (FORCE_STALE_KILL=false)"
    return
  fi

  local api_port web_port
  if [[ ${#targets[@]} -eq 0 ]]; then
    targets=(api web)
  fi

  api_port="${DEV_API_PORT:-$(read_env DEV_API_PORT 3002)}"
  web_port="${DEV_WEB_PORT:-$(read_env DEV_WEB_PORT 5174)}"

  for target in "${targets[@]}"; do
    case "${target}" in
      api)
        cleanup_port_listener "${api_port}" "api"
        ;;
      web)
        cleanup_port_listener "${web_port}" "web"
        ;;
      *)
        warn "unknown cleanup target '${target}'"
        ;;
    esac
  done
}

stop_api() {
  stop_from_pidfile "api" "${RUNTIME_DIR}/api.pid"
  cleanup_stale_listeners api
}

stop_web() {
  stop_from_pidfile "web" "${RUNTIME_DIR}/web.pid"
  cleanup_stale_listeners web
}

stop_postgres() {
  cd "${ROOT_DIR}"
  info "stopping postgres via docker compose"
  docker compose stop postgres >/dev/null || true
  pass "postgres stop requested"
}

stop_all() {
  stop_from_pidfile "api" "${RUNTIME_DIR}/api.pid"
  stop_from_pidfile "web" "${RUNTIME_DIR}/web.pid"
  cleanup_stale_listeners
  stop_postgres
}

main() {
  require_bool FORCE_STALE_KILL "${FORCE_STALE_KILL}"

  case "${TARGET}" in
    -h|--help|help)
      usage
      ;;
    api)
      stop_api
      ;;
    web)
      stop_web
      ;;
    postgres)
      stop_postgres
      ;;
    all)
      stop_all
      ;;
    *)
      fail "invalid target '${TARGET}' (use: api|web|postgres|all)"
      ;;
  esac
}

main "$@"
