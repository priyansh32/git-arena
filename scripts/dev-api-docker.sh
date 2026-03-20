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

[[ -f "${ENV_FILE}" ]] || fail "missing .env at ${ENV_FILE}"

export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(read_env GOOGLE_CLIENT_ID)}"
[[ -n "${GOOGLE_CLIENT_ID}" ]] || fail "GOOGLE_CLIENT_ID is required"

export DATABASE_URL="${DATABASE_URL:-postgres://gitarena:gitarena@localhost:5432/gitarena}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"
export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-$(read_env SESSION_COOKIE_NAME gitarena_session)}"
export SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-$(read_env SESSION_TTL_HOURS 168)}"

export WORKSPACE_PROVIDER="docker"
export WORKSPACE_IMAGE="${WORKSPACE_IMAGE:-$(read_env WORKSPACE_IMAGE gitarena-base:2.43.7-alpine3.19-v1)}"
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(read_env WORKSPACE_ROOT /workspace)}"
export WORKSPACE_SHELL="${WORKSPACE_SHELL:-$(read_env WORKSPACE_SHELL /bin/bash)}"
export WORKSPACE_CONTAINER_PREFIX="${WORKSPACE_CONTAINER_PREFIX:-$(read_env WORKSPACE_CONTAINER_PREFIX gitarena-ws)}"
export WORKSPACE_INIT_COMMAND="${WORKSPACE_INIT_COMMAND:-$(read_env WORKSPACE_INIT_COMMAND 'mkdir -p /workspace && cd /workspace && exec tail -f /dev/null')}"

cd "${ROOT_DIR}"
echo "INFO: starting API with WORKSPACE_PROVIDER=docker"
exec npm run dev:api
