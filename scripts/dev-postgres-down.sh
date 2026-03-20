#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "INFO: stopping postgres via docker compose"
docker compose stop postgres >/dev/null
echo "PASS: postgres stopped"
