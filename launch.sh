#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

TEMP_DOCKER_CONFIG=""

cleanup() {
  if [[ -n "${TEMP_DOCKER_CONFIG}" && -d "${TEMP_DOCKER_CONFIG}" ]]; then
    rm -rf "${TEMP_DOCKER_CONFIG}"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  ./launch.sh [command] [options]

Commands:
  start        Build and launch containers (default)
  stop         Stop and remove containers
  restart      Recreate containers
  status       Show container status
  logs         Tail logs
  smoke        Run API smoke test against running stack
  build        Build images
  help         Show this message

Start options:
  -d, --detach       Run in detached mode (default)
  -f, --foreground   Run in foreground mode
  --no-build         Skip image build during start

Examples:
  ./launch.sh
  ./launch.sh start --no-build
  ./launch.sh logs
  ./launch.sh stop
EOF
}

run_compose() {
  local -a args=("$@")

  if docker compose "${args[@]}"; then
    return 0
  fi

  echo "Docker Compose failed. Retrying with classic builder..." >&2
  if DOCKER_BUILDKIT=0 docker compose "${args[@]}"; then
    return 0
  fi

  echo "Retrying with isolated Docker config (no credential helper)..." >&2
  TEMP_DOCKER_CONFIG="$(mktemp -d)"
  printf '{"auths":{}}\n' > "${TEMP_DOCKER_CONFIG}/config.json"
  DOCKER_CONFIG="${TEMP_DOCKER_CONFIG}" DOCKER_BUILDKIT=0 docker compose "${args[@]}"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required but not found in PATH." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose is required but unavailable." >&2
    exit 1
  fi
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required but not found in PATH." >&2
    exit 1
  fi
}

read_env_with_default() {
  local key="$1"
  local fallback="$2"
  local env_file="${ROOT_DIR}/.env"

  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return
  fi

  if [[ -f "${env_file}" ]]; then
    local value
    value="$(grep -E "^${key}=" "${env_file}" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
    if [[ -n "${value}" ]]; then
      printf '%s' "${value}"
      return
    fi
  fi

  printf '%s' "${fallback}"
}

main() {
  require_docker
  trap cleanup EXIT

  local web_port api_port
  web_port="$(read_env_with_default TEST_WEB_PORT 5173)"
  api_port="$(read_env_with_default TEST_API_PORT 3001)"

  local command="${1:-start}"
  if [[ $# -gt 0 ]]; then
    shift
  fi

  case "${command}" in
    start|up)
      local detached=1
      local with_build=1
      local -a extra=()

      while [[ $# -gt 0 ]]; do
        case "$1" in
          -d|--detach)
            detached=1
            ;;
          -f|--foreground)
            detached=0
            ;;
          --no-build)
            with_build=0
            ;;
          -h|--help)
            usage
            exit 0
            ;;
          *)
            extra+=("$1")
            ;;
        esac
        shift
      done

      local -a up_args=(up)
      if [[ "${with_build}" -eq 1 ]]; then
        up_args+=(--build)
      fi
      if [[ "${detached}" -eq 1 ]]; then
        up_args+=(-d)
      fi
      up_args+=("${extra[@]}")

      run_compose "${up_args[@]}"

      if [[ "${detached}" -eq 1 ]]; then
        cat <<EOF
GitArena is running.
Web: http://localhost:${web_port}
API: http://localhost:${api_port}/api/v1/health/ready
EOF
      fi
      ;;
    stop|down)
      run_compose down "$@"
      ;;
    restart)
      run_compose down
      run_compose up --build -d "$@"
      cat <<EOF
GitArena is running.
Web: http://localhost:${web_port}
API: http://localhost:${api_port}/api/v1/health/ready
EOF
      ;;
    status|ps)
      run_compose ps "$@"
      ;;
    logs)
      run_compose logs -f "$@"
      ;;
    smoke)
      require_node
      node scripts/smoke-stack.mjs "$@"
      ;;
    build)
      run_compose build "$@"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
