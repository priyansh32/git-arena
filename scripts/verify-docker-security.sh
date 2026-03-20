#!/usr/bin/env bash
set -Eeuo pipefail

# Combined Docker security verification.
# - Validates workspace image hardening constraints.
# - Validates runtime hardening on a workspace container.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-gitarena-base:2.43.7-alpine3.19-v1}"
SKIP_BUILD="${SKIP_BUILD:-false}"
PRUNE_DANGLING_WORKSPACE_IMAGES="${PRUNE_DANGLING_WORKSPACE_IMAGES:-true}"

CONTAINER_NAME="${CONTAINER_NAME:-}"
REQUIRE_WORKSPACE_CONTAINER="${REQUIRE_WORKSPACE_CONTAINER:-false}"

TEMP_CONTAINER_CREATED="false"

ok() {
  printf 'PASS: %s\n' "$1"
}

info() {
  printf 'INFO: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

expect_eq() {
  local label="$1"
  local got="$2"
  local want="$3"
  if [[ "${got}" != "${want}" ]]; then
    fail "${label}: expected '${want}', got '${got}'"
  fi
  ok "${label}"
}

expect_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "${haystack}" != *"${needle}"* ]]; then
    fail "${label}: '${needle}' not found in '${haystack}'"
  fi
  ok "${label}"
}

cleanup() {
  if [[ "${TEMP_CONTAINER_CREATED}" == "true" && -n "${CONTAINER_NAME}" ]]; then
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
}

prune_dangling_workspace_images() {
  if [[ "${PRUNE_DANGLING_WORKSPACE_IMAGES}" != "true" ]]; then
    return
  fi

  docker image prune -f \
    --filter "dangling=true" \
    --filter "label=org.gitarena.component=workspace-base" >/dev/null 2>&1 || true
}

build_image_if_needed() {
  if [[ "${SKIP_BUILD}" == "true" ]]; then
    return
  fi

  info "building workspace image ${IMAGE_TAG}"
  docker build -f "${ROOT_DIR}/apps/workspace/Dockerfile" -t "${IMAGE_TAG}" "${ROOT_DIR}/apps/workspace" >/dev/null
}

run_user() {
  docker run --rm "${IMAGE_TAG}" sh -lc "$1"
}

run_root() {
  docker run --rm --user 0 "${IMAGE_TAG}" sh -lc "$1"
}

check_image_hardening() {
  if [[ "$(docker image inspect --format '{{.Config.User}}' "${IMAGE_TAG}")" != "gituser" ]]; then
    fail "image USER is not gituser"
  fi
  ok "image USER is gituser"

  if [[ "$(docker image inspect --format '{{.Config.WorkingDir}}' "${IMAGE_TAG}")" != "/workspace" ]]; then
    fail "image WORKDIR is not /workspace"
  fi
  ok "image WORKDIR is /workspace"

  local cmd_json
  cmd_json="$(docker image inspect --format '{{json .Config.Cmd}}' "${IMAGE_TAG}")"
  [[ "${cmd_json}" == *"ttyd"* ]] || fail "CMD does not invoke ttyd"
  [[ "${cmd_json}" == *"7681"* ]] || fail "CMD does not configure ttyd port 7681"
  [[ "${cmd_json}" == *"127.0.0.1"* ]] || fail "CMD does not bind ttyd to 127.0.0.1"
  ok "CMD runs ttyd on 127.0.0.1:7681"

  run_user 'test "$(id -u)" = "1000" && test "$(id -g)" = "1000"' || fail "runtime UID/GID is not 1000:1000"
  ok "runtime user is UID/GID 1000"

  run_root 'if find / -xdev -perm /6000 -type f 2>/dev/null | grep -q .; then exit 1; fi' || fail "setuid/setgid files still present"
  ok "no setuid/setgid files present on image filesystem"

  run_user 'command -v sudo >/dev/null 2>&1 && exit 1 || true' || fail "sudo is present"
  run_user 'command -v su >/dev/null 2>&1 && exit 1 || true' || fail "su is present"
  ok "sudo and su are absent"

  run_user 'git --version | grep -Fx "git version 2.43.7" >/dev/null' || fail "git version is not pinned to 2.43.7"
  ok "git version is pinned"

  run_root 'apk info -e ttyd=1.7.4-r0 >/dev/null' || fail "ttyd version is not pinned to 1.7.4-r0"
  ok "ttyd version is pinned"

  run_user 'test "$(stat -c "%u:%g:%a" /workspace)" = "1000:1000:755"' || fail "/workspace ownership/permissions are incorrect"
  run_user 'test "$(stat -c "%u:%g:%a" /repos)" = "1000:1000:755"' || fail "/repos ownership/permissions are incorrect"
  run_user 'test "$(stat -c "%a" /tmp)" = "1777"' || fail "/tmp permissions are not 1777"
  ok "workspace/repo/tmp permissions are correct"

  run_user 'touch /workspace/.perm-check && rm -f /workspace/.perm-check && touch /repos/.perm-check && rm -f /repos/.perm-check' || fail "gituser cannot write in /workspace or /repos"
  ok "gituser can write to /workspace and /repos"

  run_user 'touch /etc/.perm-check >/dev/null 2>&1 && exit 1 || true' || fail "gituser can write outside workspace"
  ok "gituser cannot write to /etc"

  run_user 'for d in /usr /bin /sbin /etc; do test ! -w "$d" || exit 1; done' || fail "system directories are writable by gituser"
  ok "system directories are non-writable by gituser"

  run_root 'test "$(git config --system --get core.hooksPath)" = "/dev/null"' || fail "core.hooksPath is not /dev/null"
  run_root 'git config --system --get-all safe.directory | grep -Fx "/workspace" >/dev/null' || fail "safe.directory /workspace is not configured"
  ok "system git config hardening is present"

  run_root 'test -f /usr/local/lib/python3.11/gitarena_eval.py' || fail "gitarena_eval.py is missing"
  ok "gitarena_eval.py exists at policy path"

  run_user 'python3 -c "import pathlib; pathlib.Path(\"/usr/local/lib/python3.11/gitarena_eval.py\").read_text()"' >/dev/null || fail "gitarena_eval.py is not readable"
  ok "gitarena_eval.py is readable"

  local env_entry
  for env_entry in \
    "HOME=/home/gituser" \
    "SHELL=/bin/bash" \
    "TERM=xterm-256color" \
    "GIT_AUTHOR_NAME=Git Arena" \
    "GIT_AUTHOR_EMAIL=user@gitarena.dev" \
    "GIT_COMMITTER_NAME=Git Arena" \
    "GIT_COMMITTER_EMAIL=user@gitarena.dev" \
    "LANG=en_US.UTF-8"
  do
    run_user "env | grep -Fx '${env_entry}' >/dev/null" || fail "missing env var ${env_entry}"
  done
  ok "policy env vars are set"

  docker run --rm --network none "${IMAGE_TAG}" sh -lc 'curl -fsS https://example.com >/dev/null 2>&1 && exit 1 || true' || fail "curl unexpectedly succeeded with --network none"
  ok "network client behavior is consistent with no-network runtime"
}

create_temp_runtime_container() {
  local temp_name="gitarena-ws-docker-security-verify"
  docker rm -f "${temp_name}" >/dev/null 2>&1 || true

  docker run -d --rm \
    --name "${temp_name}" \
    --label gitarena.workspace=true \
    --network none \
    --user 1000:1000 \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --memory 256m \
    --memory-reservation 128m \
    --memory-swap 256m \
    --cpus 0.5 \
    --pids-limit 100 \
    --env HOME=/home/gituser \
    --env SHELL=/bin/bash \
    --env TERM=xterm-256color \
    --env GIT_AUTHOR_NAME="Git Arena" \
    --env GIT_AUTHOR_EMAIL="user@gitarena.dev" \
    --env GIT_COMMITTER_NAME="Git Arena" \
    --env GIT_COMMITTER_EMAIL="user@gitarena.dev" \
    --env LANG=en_US.UTF-8 \
    -w /workspace \
    --entrypoint sh \
    "${IMAGE_TAG}" \
    -lc 'exec tail -f /dev/null' >/dev/null

  CONTAINER_NAME="${temp_name}"
  TEMP_CONTAINER_CREATED="true"
  info "created temporary verification container ${CONTAINER_NAME}"
}

resolve_runtime_container() {
  if [[ -n "${CONTAINER_NAME}" ]]; then
    return
  fi

  CONTAINER_NAME="$(docker ps --filter label=gitarena.workspace=true --format '{{.Names}}' | head -n 1 | tr -d ' ')"

  if [[ -n "${CONTAINER_NAME}" ]]; then
    info "using running workspace container ${CONTAINER_NAME}"
    return
  fi

  if [[ "${REQUIRE_WORKSPACE_CONTAINER}" == "true" ]]; then
    fail "no running workspace container found"
  fi

  warn "no running workspace container found; using temporary container for runtime checks"
  create_temp_runtime_container
}

ensure_runtime_container_running() {
  local running
  running="$(docker inspect --format '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
  [[ "${running}" == "true" ]] || fail "container '${CONTAINER_NAME}' is not running"
  ok "container '${CONTAINER_NAME}' is running"
}

inspect_field() {
  local format="$1"
  docker inspect --format "${format}" "${CONTAINER_NAME}"
}

check_runtime_host_config() {
  local network_mode cap_drop security_opts memory memory_reservation memory_swap nano_cpus pids_limit config_user

  network_mode="$(inspect_field '{{.HostConfig.NetworkMode}}')"
  expect_eq "network mode" "${network_mode}" "none"

  cap_drop="$(inspect_field '{{json .HostConfig.CapDrop}}')"
  expect_contains "capabilities dropped" "${cap_drop}" "ALL"

  security_opts="$(inspect_field '{{json .HostConfig.SecurityOpt}}')"
  expect_contains "no-new-privileges" "${security_opts}" "no-new-privileges"

  memory="$(inspect_field '{{.HostConfig.Memory}}')"
  expect_eq "memory limit" "${memory}" "268435456"

  memory_reservation="$(inspect_field '{{.HostConfig.MemoryReservation}}')"
  expect_eq "memory reservation" "${memory_reservation}" "134217728"

  memory_swap="$(inspect_field '{{.HostConfig.MemorySwap}}')"
  expect_eq "memory swap limit" "${memory_swap}" "268435456"

  nano_cpus="$(inspect_field '{{.HostConfig.NanoCpus}}')"
  expect_eq "cpu limit" "${nano_cpus}" "500000000"

  pids_limit="$(inspect_field '{{.HostConfig.PidsLimit}}')"
  expect_eq "pids limit" "${pids_limit}" "100"

  config_user="$(inspect_field '{{.Config.User}}')"
  expect_eq "container user" "${config_user}" "1000:1000"
}

check_runtime_behavior() {
  local uid gid cap_eff

  uid="$(docker exec "${CONTAINER_NAME}" id -u)"
  gid="$(docker exec "${CONTAINER_NAME}" id -g)"
  expect_eq "runtime uid" "${uid}" "1000"
  expect_eq "runtime gid" "${gid}" "1000"

  cap_eff="$(docker exec "${CONTAINER_NAME}" sh -lc 'awk "/^CapEff:/ {print \$2}" /proc/1/status')"
  [[ "${cap_eff}" =~ ^0+$ ]] || fail "effective capabilities are not zeroed (CapEff=${cap_eff})"
  ok "effective capabilities are dropped"

  if docker exec "${CONTAINER_NAME}" sh -lc 'mkdir -p /tmp/mnt && mount -t tmpfs tmpfs /tmp/mnt' >/dev/null 2>&1; then
    fail "privileged mount unexpectedly succeeded"
  fi
  ok "privileged mount is blocked"

  if docker exec "${CONTAINER_NAME}" sh -lc 'curl -fsS --connect-timeout 5 https://example.com >/dev/null'; then
    fail "outbound network unexpectedly succeeded"
  fi
  ok "outbound network is blocked"
}

main() {
  trap cleanup EXIT

  need_cmd docker

  build_image_if_needed
  prune_dangling_workspace_images
  check_image_hardening

  resolve_runtime_container
  ensure_runtime_container_running
  check_runtime_host_config
  check_runtime_behavior

  ok "docker security verification completed"
}

main "$@"
