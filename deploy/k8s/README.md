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

## API Deploy Template (GKE + Cloud SQL Proxy)

`api-deploy.yaml` is an envsubst template for API deployment.

Quick start:

```bash
cp deploy/k8s/api-deploy.env.example deploy/k8s/api-deploy.env
# edit deploy/k8s/api-deploy.env
./scripts/env-lint.sh
set -a
source deploy/k8s/api-deploy.env
set +a
envsubst < deploy/k8s/api-deploy.yaml | kubectl apply -f -
```

Notes:

- `DB_PASSWORD_URLENC` must be URL-encoded (not raw password).
- `CORS_ORIGINS` should match your web origin (for example `https://git-arena.hellopriyansh.xyz`).
- `API_DOMAIN` is used for GKE Ingress host (for example `api.git-arena.hellopriyansh.xyz`).
- `API_GLOBAL_STATIC_IP_NAME` should reference a reserved global static IP (for example `gitarena-api-ip`) so ingress IP stays stable across reconciles.
- `API_PRE_SHARED_CERT_NAME` should reference a global Compute managed SSL certificate name (for example `gitarena-api-cert-global`).
- API pods are pinned to node pool `control-plane` and tolerate taint `dedicated=api:NoSchedule`.
  Taint control-plane nodes with:
  `kubectl taint nodes -l cloud.google.com/gke-nodepool=control-plane dedicated=api:NoSchedule --overwrite`
- `WORKSPACE_K8S_CONTEXT` is optional. Use it to run session pods in a different cluster context (for example `sandbox-cluster`) without moving the API deployment.
- `WORKSPACE_K8S_KUBECONFIG` is optional. Set it when the target context is not in the default kubeconfig inside the API container.
  - The deployment includes an optional secret mount at `/var/run/gitarena-session-kubeconfig`.
  - To provide kubeconfig for cross-cluster session control:
    `kubectl -n gitarena-api create secret generic gitarena-session-kubeconfig --from-file=config=/path/to/kubeconfig --dry-run=client -o yaml | kubectl apply -f -`
  - Then set `WORKSPACE_K8S_KUBECONFIG=/var/run/gitarena-session-kubeconfig/config`.
- `WORKSPACE_K8S_NODE_POOL` is optional. Set this to pin session pods to a dedicated pool in the target cluster (for example `sandbox-pool`).
- Example for the new sessions cluster:
  - `WORKSPACE_K8S_CONTEXT=gke_<project>_<zone-or-region>_sandbox-cluster`
  - `WORKSPACE_K8S_NODE_POOL=sandbox-pool`
- The template configures HTTPS-only ingress (`kubernetes.io/ingress.allow-http: "false"`).
- The template also applies a GKE `BackendConfig` with `timeoutSec: 3600` so long-lived WebSocket terminal sessions are not dropped at the default 30-second backend timeout.

Important:

- API pods must run in namespace `gitarena-api` with label `app: api-backend`.
- For cross-cluster session execution, ensure the API runtime has credentials and RBAC to create/exec/delete pods in the target sessions cluster namespace.
- If the API is running outside the cluster (host machine), this policy blocks terminal ingress by design.
- `deploy/k8s/api-deploy.env` is local-only and intentionally not tracked in git.

## Cluster Prerequisites

### Phase 2 — gVisor RuntimeClass

Challenge pods use `runtimeClassName: gvisor`. The cluster needs gVisor support:

1. Use GKE with a node pool that supports GKE Sandbox / runsc-enabled nodes.
2. Confirm: `kubectl get runtimeclass gvisor`
3. If missing, install after runsc support is available:
   ```yaml
   apiVersion: node.k8s.io/v1
   kind: RuntimeClass
   metadata:
     name: gvisor
   handler: runsc
   ```

### Phase 2 — Service Account Token Mounting

Challenge pods disable token mounting (`automountServiceAccountToken: false`, `enableServiceLinks: false`, `serviceAccountName: ""`). Challenge containers never call the Kubernetes API — orchestration is done by the backend. If future scenarios need in-pod K8s API access, this must be explicitly reviewed.

### Phase 2 — API RBAC

The API must create/delete/exec into pods in `gitarena-sessions`:

```bash
kubectl apply -f deploy/k8s/api-workspace-rbac.yaml
```

Run the API in namespace `gitarena-api` with service account `api-backend`.

### Phase 3 — NetworkPolicy CNI

`session-isolation-networkpolicy.yaml` enforces ingress (only from `gitarena-api` pods labeled `app: api-backend` on port `7681`) and denies all egress. Requires a CNI that enforces `NetworkPolicy` (GKE Dataplane V2, Calico, or Cilium). Without one, the manifest applies but has no effect.

The API pod must match namespace `gitarena-api` and label `app: api-backend`. If API runs outside the cluster, session pod ingress on `7681` is blocked by design.

### Phase 4 — Metrics API

Session monitor needs `metrics-server` for per-pod CPU/memory:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top pods -n gitarena-sessions
```

The API service account also needs read access to `metrics.k8s.io` and exec into session pods. Phase 2 RBAC remains required.

## Verification Scripts

Use manual `kubectl` verification for security controls and network policy behavior.

## K8s Operations

### Prerequisites for `WORKSPACE_PROVIDER=kubernetes`

- kube context must be configured (`kubectl config current-context`)
- `runtimeclass/gvisor` must exist
- namespace `gitarena-sessions` should exist
- workspace image must be available in Artifact Registry

### Operational Checks

1. `GET /api/v1/health/ready` returns `200`
2. Sign in with Google
3. Start session
4. Verify pod appears: `kubectl -n gitarena-sessions get pods`
5. Submit or quit session and verify pod cleanup

### GKE Auth Plugin

If `kubectl` mentions missing `gke-gcloud-auth-plugin`:

```bash
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```
