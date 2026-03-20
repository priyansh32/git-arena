# Kubernetes Session Manifests

This directory contains Kubernetes manifests for GitArena session runtime hardening.

## Included in Phase 2

- `api-workspace-rbac.yaml`
  - Creates `api-backend` ServiceAccount in `gitarena-api`
  - Grants API permissions in `gitarena-sessions` for pod create/get/delete/exec
- `challenge-session-pod.yaml`
  - Applies pod-level and container-level security context
  - Sets `runtimeClassName: gvisor`
  - Disables service account token mounting
  - Disables Kubernetes service-link env injection (`enableServiceLinks: false`)
  - Sets policy resource requests/limits
  - Uses localhost exec liveness probe for ttyd (`127.0.0.1:7681`)
  - Restricts challenge-container env vars to the policy allowlist
  - Uses `restartPolicy: Never` and `terminationGracePeriodSeconds: 10`

## Included in Phase 3

- `session-isolation-networkpolicy.yaml`
  - Applies to pods labeled `app: challenge-session` in namespace `gitarena-sessions`
  - Allows ingress only from pods labeled `app: api-backend` in namespace `gitarena-api` on TCP `7681`
  - Denies all pod egress (`egress: []`), including DNS

## Template Variables

`challenge-session-pod.yaml` is a template and expects these substitutions:

- `${SESSION_ID}`
- `${USER_ID}`
- `${SCENARIO_ID}`
- `${GCP_PROJECT_ID}`

Example rendering and apply:

```bash
export SESSION_ID=session-123
export USER_ID=user-123
export SCENARIO_ID=detached-head-recovery
export GCP_PROJECT_ID=my-gcp-project

envsubst < deploy/k8s/challenge-session-pod.yaml | kubectl apply -f -
```

Apply API RBAC once:

```bash
kubectl apply -f deploy/k8s/api-workspace-rbac.yaml
```

Apply network isolation policy:

```bash
kubectl apply -f deploy/k8s/session-isolation-networkpolicy.yaml
```

Important:

- API pods must run in namespace `gitarena-api` with label `app: api-backend`.
- If the API is running outside the cluster (host machine), this policy blocks terminal ingress by design.

## Verification Scripts

Initialize GCP/Kubernetes resources once:

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/gcp-init.sh
```

Run full security verification:

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/gcp-verify.sh
```

If the workspace image is not in Artifact Registry yet:

```bash
export GCP_PROJECT_ID=my-gcp-project
PUSH_IMAGE=true ./scripts/gcp-init.sh
```

Teardown everything after verification:

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/gcp-teardown.sh
```
