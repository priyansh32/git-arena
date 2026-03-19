#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-}"
ZONE="${ZONE:-us-central1-a}"
REGION="${REGION:-${ZONE%-*}}"
VM_NAME="${VM_NAME:-gitarena-vm}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"
BOOT_DISK_SIZE_GB="${BOOT_DISK_SIZE_GB:-30}"
BOOT_DISK_TYPE="${BOOT_DISK_TYPE:-pd-standard}"
USE_SPOT="${USE_SPOT:-false}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-}"
NETWORK_TAGS="${NETWORK_TAGS:-gitarena-web,gitarena-ssh}"

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

ensure_firewall_rule() {
  local name="$1"
  shift

  if gcloud compute firewall-rules describe "${name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    return
  fi

  gcloud compute firewall-rules create "${name}" --project "${PROJECT_ID}" "$@"
}

main() {
  require_command gcloud
  require_var PROJECT_ID "${PROJECT_ID}"

  gcloud config set project "${PROJECT_ID}" >/dev/null

  ensure_firewall_rule \
    "gitarena-allow-http" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=gitarena-web

  ensure_firewall_rule \
    "gitarena-allow-ssh" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:22 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=gitarena-ssh

  if gcloud compute instances describe "${VM_NAME}" --project "${PROJECT_ID}" --zone "${ZONE}" >/dev/null 2>&1; then
    echo "VM already exists: ${VM_NAME}"
  else
    local startup_script
    startup_script="$(mktemp)"
    trap 'rm -f "${startup_script}"' EXIT

    cat >"${startup_script}" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git jq

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi

chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  >/etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl restart docker
EOF

    local -a instance_args=(
      compute instances create "${VM_NAME}"
      --project "${PROJECT_ID}"
      --zone "${ZONE}"
      --machine-type "${MACHINE_TYPE}"
      --boot-disk-size "${BOOT_DISK_SIZE_GB}GB"
      --boot-disk-type "${BOOT_DISK_TYPE}"
      --image-family debian-12
      --image-project debian-cloud
      --tags "${NETWORK_TAGS}"
      --scopes https://www.googleapis.com/auth/cloud-platform
      --metadata-from-file "startup-script=${startup_script}"
    )

    if [[ "${USE_SPOT}" == "true" ]]; then
      instance_args+=(--provisioning-model SPOT)
    fi

    if [[ -n "${SERVICE_ACCOUNT_EMAIL}" ]]; then
      instance_args+=(--service-account "${SERVICE_ACCOUNT_EMAIL}")
    fi

    gcloud "${instance_args[@]}"
  fi

  local vm_ip
  vm_ip="$(
    gcloud compute instances describe "${VM_NAME}" \
      --project "${PROJECT_ID}" \
      --zone "${ZONE}" \
      --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
  )"

  cat <<EOF
Provisioning finished.
Project: ${PROJECT_ID}
Region: ${REGION}
Zone: ${ZONE}
VM: ${VM_NAME}
External IP: ${vm_ip}
EOF
}

main "$@"
