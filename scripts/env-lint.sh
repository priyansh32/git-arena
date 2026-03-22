#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LOCAL_EXAMPLE_FILE="${ROOT_DIR}/.env.example"
LOCAL_FILE="${ROOT_DIR}/.env"
DEPLOY_EXAMPLE_FILE="${ROOT_DIR}/deploy/k8s/api-deploy.env.example"
DEPLOY_FILE="${ROOT_DIR}/deploy/k8s/api-deploy.env"

LOCAL_ALLOWED_KEYS=(
  HOST
  API_PORT
  WEB_PORT
  PORT
  DATABASE_URL
  K8S_USE_CLOUDSQL
  CLOUDSQL_ENV_FILE
  CORS_ORIGINS
  GOOGLE_CLIENT_ID
  AUTH_TEST_MODE
  AUTH_TEST_ALLOWED_EMAILS
  VITE_GOOGLE_CLIENT_ID
  VITE_ALLOWED_HOSTS
  VITE_API_PROXY_HOST
  VITE_API_PROXY_TARGET
  SESSION_COOKIE_NAME
  SESSION_TTL_HOURS
  WORKSPACE_PROVIDER
  WORKSPACE_IMAGE
  WORKSPACE_ROOT
  WORKSPACE_SHELL
  WORKSPACE_CONTAINER_PREFIX
  WORKSPACE_INIT_COMMAND
  WORKSPACE_K8S_NAMESPACE
  WORKSPACE_K8S_RUNTIME_CLASS_NAME
  WORKSPACE_K8S_IMAGE_PULL_POLICY
  WORKSPACE_K8S_POD_READY_TIMEOUT_SECONDS
  GCP_PROJECT_ID
  WORKSPACE_AR_LOCATION
  WORKSPACE_AR_REPOSITORY
  WORKSPACE_IMAGE_TAG
)

LOCAL_REQUIRED_KEYS=(
  GOOGLE_CLIENT_ID
  VITE_GOOGLE_CLIENT_ID
)

DEPLOY_ALLOWED_KEYS=(
  GCP_API_GSA_EMAIL
  NODE_ENV
  DB_PASSWORD_URLENC
  GOOGLE_CLIENT_ID
  CORS_ORIGINS
  WORKSPACE_IMAGE
  API_IMAGE
  INSTANCE_CONNECTION_NAME
  API_DOMAIN
  API_GLOBAL_STATIC_IP_NAME
  API_PRE_SHARED_CERT_NAME
)

DEPLOY_REQUIRED_KEYS=(
  GCP_API_GSA_EMAIL
  DB_PASSWORD_URLENC
  GOOGLE_CLIENT_ID
  CORS_ORIGINS
  WORKSPACE_IMAGE
  API_IMAGE
  INSTANCE_CONNECTION_NAME
  API_DOMAIN
  API_GLOBAL_STATIC_IP_NAME
  API_PRE_SHARED_CERT_NAME
)

contains_key() {
  local needle="$1"
  shift
  local key
  for key in "$@"; do
    if [[ "${key}" == "${needle}" ]]; then
      return 0
    fi
  done
  return 1
}

extract_keys() {
  local file_path="$1"
  grep -E '^[A-Z][A-Z0-9_]*=' "${file_path}" | sed -E 's/^([A-Z0-9_]+)=.*/\1/'
}

has_non_empty_value() {
  local file_path="$1"
  local key="$2"
  grep -Eq "^${key}=.*[^[:space:]].*$" "${file_path}"
}

print_list() {
  local header="$1"
  shift
  local values=("$@")

  printf '%s\n' "${header}"
  local value
  for value in "${values[@]}"; do
    printf '  - %s\n' "${value}"
  done
}

lint_env_file() {
  local file_path="$1"
  local label="$2"
  local -n allowed_ref="$3"
  local -n required_ref="$4"

  if [[ ! -f "${file_path}" ]]; then
    printf 'SKIP: %s not found (%s)\n' "${label}" "${file_path}"
    return 0
  fi

  local -a file_keys=()
  mapfile -t file_keys < <(extract_keys "${file_path}")

  if [[ ${#file_keys[@]} -eq 0 ]]; then
    printf 'WARN: %s has no KEY=value entries (%s)\n' "${label}" "${file_path}"
    return 0
  fi

  local -a unknown_keys=()
  local key
  for key in "${file_keys[@]}"; do
    if ! contains_key "${key}" "${allowed_ref[@]}"; then
      unknown_keys+=("${key}")
    fi
  done

  local -a duplicate_keys=()
  mapfile -t duplicate_keys < <(printf '%s\n' "${file_keys[@]}" | sort | uniq -d)

  local -a missing_required=()
  for key in "${required_ref[@]}"; do
    if ! has_non_empty_value "${file_path}" "${key}"; then
      missing_required+=("${key}")
    fi
  done

  if [[ ${#unknown_keys[@]} -eq 0 && ${#duplicate_keys[@]} -eq 0 && ${#missing_required[@]} -eq 0 ]]; then
    printf 'PASS: %s (%s)\n' "${label}" "${file_path}"
    return 0
  fi

  printf 'FAIL: %s (%s)\n' "${label}" "${file_path}"
  if [[ ${#unknown_keys[@]} -gt 0 ]]; then
    print_list "Unknown keys:" "${unknown_keys[@]}"
  fi
  if [[ ${#duplicate_keys[@]} -gt 0 ]]; then
    print_list "Duplicate keys:" "${duplicate_keys[@]}"
  fi
  if [[ ${#missing_required[@]} -gt 0 ]]; then
    print_list "Missing/empty required keys:" "${missing_required[@]}"
  fi
  return 1
}

main() {
  local failed=0

  lint_env_file "${LOCAL_EXAMPLE_FILE}" "local template" LOCAL_ALLOWED_KEYS LOCAL_REQUIRED_KEYS || failed=1
  lint_env_file "${LOCAL_FILE}" "local runtime env" LOCAL_ALLOWED_KEYS LOCAL_REQUIRED_KEYS || failed=1
  lint_env_file "${DEPLOY_EXAMPLE_FILE}" "k8s deploy template" DEPLOY_ALLOWED_KEYS DEPLOY_REQUIRED_KEYS || failed=1
  lint_env_file "${DEPLOY_FILE}" "k8s deploy runtime env" DEPLOY_ALLOWED_KEYS DEPLOY_REQUIRED_KEYS || failed=1

  if [[ "${failed}" -ne 0 ]]; then
    printf '\nLint failed. Fix env key mismatches above.\n'
    exit 1
  fi

  printf '\nAll checked env files are clean.\n'
}

main "$@"
