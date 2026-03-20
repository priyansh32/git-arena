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

## Note

Network isolation (`NetworkPolicy`) is intentionally not included in this phase and is implemented in Phase 3.

## Verification Scripts

Run full Phase 2 verification (cluster bootstrap + checks):

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/verify-phase2-gke.sh
```

If the workspace image is not in Artifact Registry yet:

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/push-workspace-image-gcp.sh
```

Teardown everything after verification:

```bash
export GCP_PROJECT_ID=my-gcp-project
./scripts/delete-phase2-gke.sh
```
