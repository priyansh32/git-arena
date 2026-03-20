#!/usr/bin/env bash
set -Eeuo pipefail

# Unified local development shutdown script.
# Usage:
#   ./scripts/dev-down.sh api
#   ./scripts/dev-down.sh web
#   ./scripts/dev-down.sh postgres
#   ./scripts/dev-down.sh all

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"
TARGET="${1:-all}" # api|web|postgres|all

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
    kill "${pid}" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
    pass "${name} stopped"
  else
    info "${name}: process ${pid} not running"
  fi

  rm -f "${pidfile}"
}

stop_api() {
  stop_from_pidfile "api" "${RUNTIME_DIR}/api.pid"
}

stop_web() {
  stop_from_pidfile "web" "${RUNTIME_DIR}/web.pid"
}

stop_postgres() {
  cd "${ROOT_DIR}"
  info "stopping postgres via docker compose"
  docker compose stop postgres >/dev/null || true
  pass "postgres stop requested"
}

stop_all() {
  stop_api
  stop_web
  stop_postgres
}

main() {
  case "${TARGET}" in
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
