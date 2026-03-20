#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER_NAME="${1:-}"

ok() {
  printf 'PASS: %s\n' "$1"
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

resolve_container_name() {
  if [[ -n "${CONTAINER_NAME}" ]]; then
    return
  fi

  CONTAINER_NAME="$(docker ps --filter label=gitarena.workspace=true --format '{{.Names}}' | head -n 1 | tr -d ' ')"
  [[ -n "${CONTAINER_NAME}" ]] || fail "no running workspace container found (start one via app first)"
}

ensure_running() {
  local running
  running="$(docker inspect --format '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
  [[ "${running}" == "true" ]] || fail "container '${CONTAINER_NAME}' is not running"
  ok "container '${CONTAINER_NAME}' is running"
}

inspect_field() {
  local format="$1"
  docker inspect --format "${format}" "${CONTAINER_NAME}"
}

check_host_config() {
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
  need_cmd docker

  resolve_container_name
  ensure_running
  check_host_config
  check_runtime_behavior

  ok "docker provider phase3 hardening verification complete for ${CONTAINER_NAME}"
}

main "$@"
