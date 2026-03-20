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
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  printf '%s' "${value}"
}

[[ -f "${ENV_FILE}" ]] || fail "missing .env at ${ENV_FILE}"

export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-$(read_env VITE_GOOGLE_CLIENT_ID)}"
[[ -n "${VITE_GOOGLE_CLIENT_ID}" ]] || fail "VITE_GOOGLE_CLIENT_ID is required"

cd "${ROOT_DIR}"
echo "INFO: starting web dev server on http://localhost:5173"
exec npm run dev:web
