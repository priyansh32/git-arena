#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "INFO: starting postgres via docker compose"
docker compose up -d postgres

echo "INFO: waiting for postgres health"
for _ in {1..30}; do
  if docker compose exec -T postgres pg_isready -U gitarena -d gitarena >/dev/null 2>&1; then
    echo "PASS: postgres is healthy"
    exit 0
  fi
  sleep 1
done

echo "FAIL: postgres health check did not report healthy within 30s" >&2
exit 1
