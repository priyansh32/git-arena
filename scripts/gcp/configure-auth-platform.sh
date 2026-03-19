#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value core/project 2>/dev/null || true)}"
AUTH_DOMAINS="${AUTH_DOMAINS:-localhost,127.0.0.1,gitarena.hellopriyansh.xyz}"
GOOGLE_PROVIDER_CLIENT_ID="${GOOGLE_PROVIDER_CLIENT_ID:-}"
GOOGLE_PROVIDER_CLIENT_SECRET="${GOOGLE_PROVIDER_CLIENT_SECRET:-}"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
}

require_var() {
  local var_name="$1"
  local var_value="$2"
  if [[ -z "${var_value}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
}

api_call() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  if [[ -n "${body}" ]]; then
    curl -sS -X "${method}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "x-goog-user-project: ${PROJECT_ID}" \
      -H "Content-Type: application/json" \
      "${url}" \
      --data-binary "${body}"
    return
  fi

  curl -sS -X "${method}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    "${url}"
}

main() {
  require_command gcloud
  require_command curl
  require_var PROJECT_ID "${PROJECT_ID}"

  gcloud config set project "${PROJECT_ID}" >/dev/null
  gcloud services enable identitytoolkit.googleapis.com --project "${PROJECT_ID}" >/dev/null

  ACCESS_TOKEN="$(gcloud auth print-access-token)"
  export ACCESS_TOKEN

  echo "Initializing Auth Platform for project ${PROJECT_ID} ..."
  api_call "POST" "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth" "{}" >/dev/null

  local config_json
  config_json="$(api_call "GET" "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config")"

  local existing_domains_csv
  existing_domains_csv="$(
    node -e '
      const input = process.argv[1];
      const json = JSON.parse(input);
      const domains = Array.isArray(json.authorizedDomains) ? json.authorizedDomains : [];
      process.stdout.write(domains.join(","));
    ' "${config_json}"
  )"

  local combined_domains_csv
  combined_domains_csv="${existing_domains_csv},${AUTH_DOMAINS}"

  local authorized_domains_json
  authorized_domains_json="$(
    node -e '
      const csv = process.argv[1];
      const unique = [...new Set(csv.split(",").map((item) => item.trim()).filter(Boolean))];
      process.stdout.write(JSON.stringify({ authorizedDomains: unique }));
    ' "${combined_domains_csv}"
  )"

  api_call \
    "PATCH" \
    "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config?updateMask=authorizedDomains" \
    "${authorized_domains_json}" >/dev/null

  if [[ -n "${GOOGLE_PROVIDER_CLIENT_ID}" || -n "${GOOGLE_PROVIDER_CLIENT_SECRET}" ]]; then
    require_var GOOGLE_PROVIDER_CLIENT_ID "${GOOGLE_PROVIDER_CLIENT_ID}"
    require_var GOOGLE_PROVIDER_CLIENT_SECRET "${GOOGLE_PROVIDER_CLIENT_SECRET}"

    local provider_payload
    provider_payload="$(
      node -e '
        const payload = {
          enabled: true,
          clientId: process.argv[1],
          clientSecret: process.argv[2]
        };
        process.stdout.write(JSON.stringify(payload));
      ' "${GOOGLE_PROVIDER_CLIENT_ID}" "${GOOGLE_PROVIDER_CLIENT_SECRET}"
    )"

    local provider_name
    provider_name="projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com"

    local provider_get
    provider_get="$(
      api_call "GET" "https://identitytoolkit.googleapis.com/v2/${provider_name}" || true
    )"

    if grep -q '"name"' <<<"${provider_get}"; then
      api_call \
        "PATCH" \
        "https://identitytoolkit.googleapis.com/v2/${provider_name}?updateMask=enabled,clientId,clientSecret" \
        "${provider_payload}" >/dev/null
      echo "Updated google.com provider config."
    else
      api_call \
        "POST" \
        "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs?idpId=google.com" \
        "${provider_payload}" >/dev/null
      echo "Created google.com provider config."
    fi
  else
    echo "Skipped google.com provider setup (GOOGLE_PROVIDER_CLIENT_ID/SECRET not provided)."
  fi

  local final_config
  final_config="$(api_call "GET" "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config")"

  local provider_state
  provider_state="$(api_call "GET" "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com" || true)"

  echo
  echo "Auth Platform configuration:"
  node -e '
    const config = JSON.parse(process.argv[1]);
    const provider = (() => {
      try {
        return JSON.parse(process.argv[2]);
      } catch {
        return null;
      }
    })();

    const apiKey = config?.client?.apiKey ?? "";
    const domains = Array.isArray(config?.authorizedDomains) ? config.authorizedDomains : [];
    const clientId = provider?.clientId ?? "";
    const providerEnabled = provider?.enabled === true;

    console.log(`- project: ${process.argv[3]}`);
    console.log(`- api_key: ${apiKey}`);
    console.log(`- google_provider_enabled: ${providerEnabled}`);
    if (clientId) {
      console.log(`- google_client_id: ${clientId}`);
      console.log(`- set GOOGLE_CLIENT_ID=${clientId}`);
      console.log(`- set VITE_GOOGLE_CLIENT_ID=${clientId}`);
    } else {
      console.log("- google_client_id: <not configured>");
    }
    console.log(`- authorized_domains: ${domains.join(",")}`);
  ' "${final_config}" "${provider_state}" "${PROJECT_ID}"
}

main "$@"
