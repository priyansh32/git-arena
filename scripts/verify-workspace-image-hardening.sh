#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_TAG="${1:-gitarena-base:2.43.7-alpine3.19-v1}"
SKIP_BUILD="${2:-}"
PRUNE_DANGLING_WORKSPACE_IMAGES="${PRUNE_DANGLING_WORKSPACE_IMAGES:-true}"

if [[ "${SKIP_BUILD}" != "--skip-build" ]]; then
  docker build -f apps/workspace/Dockerfile -t "${IMAGE_TAG}" apps/workspace
fi

ok() {
  printf 'OK: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

prune_dangling_workspace_images() {
  if [[ "${PRUNE_DANGLING_WORKSPACE_IMAGES}" != "true" ]]; then
    return
  fi

  docker image prune -f \
    --filter "dangling=true" \
    --filter "label=org.gitarena.component=workspace-base" >/dev/null 2>&1 || true
}

prune_dangling_workspace_images

run_user() {
  docker run --rm "${IMAGE_TAG}" sh -lc "$1"
}

run_root() {
  docker run --rm --user 0 "${IMAGE_TAG}" sh -lc "$1"
}

if [[ "$(docker image inspect --format '{{.Config.User}}' "${IMAGE_TAG}")" != "gituser" ]]; then
  fail "image USER is not gituser"
fi
ok "image USER is gituser"

if [[ "$(docker image inspect --format '{{.Config.WorkingDir}}' "${IMAGE_TAG}")" != "/workspace" ]]; then
  fail "image WORKDIR is not /workspace"
fi
ok "image WORKDIR is /workspace"

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

ok "workspace image hardening verification completed"
