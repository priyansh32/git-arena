#!/usr/bin/env bash

# Shared helpers/constants for GitArena shell scripts.

GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT="2.43.7-alpine3.19-v1"
GITARENA_WORKSPACE_IMAGE_NAME_DEFAULT="gitarena-base"
GITARENA_AR_LOCATION_DEFAULT="us-central1"
GITARENA_AR_REPOSITORY_DEFAULT="gitarena"
GITARENA_SESSIONS_NAMESPACE_DEFAULT="gitarena-sessions"
GITARENA_API_NAMESPACE_DEFAULT="gitarena-api"

info() {
  printf 'INFO: %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

is_bool() {
  local value="$1"
  [[ "${value}" == "true" || "${value}" == "false" ]]
}

require_bool() {
  local name="$1"
  local value="$2"
  is_bool "${value}" || fail "${name} must be true or false"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

cluster_flag() {
  local location_type="$1"
  local location="$2"
  if [[ "${location_type}" == "region" ]]; then
    printf -- "--region=%s" "${location}"
  else
    printf -- "--zone=%s" "${location}"
  fi
}

workspace_image_ref() {
  local project_id="$1"
  local ar_location="${2:-${GITARENA_AR_LOCATION_DEFAULT}}"
  local ar_repository="${3:-${GITARENA_AR_REPOSITORY_DEFAULT}}"
  local image_tag="${4:-${GITARENA_WORKSPACE_IMAGE_TAG_DEFAULT}}"

  printf '%s-docker.pkg.dev/%s/%s/%s:%s' \
    "${ar_location}" \
    "${project_id}" \
    "${ar_repository}" \
    "${GITARENA_WORKSPACE_IMAGE_NAME_DEFAULT}" \
    "${image_tag}"
}
