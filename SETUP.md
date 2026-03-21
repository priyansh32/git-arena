# GitArena Cluster Setup Notes

This file tracks cluster prerequisites required by the workspace security policy.

## Phase 2 Prerequisites (Pod Security Context)

### 1) gVisor RuntimeClass (`runtimeClassName: gvisor`)

Challenge pods are configured with:

```yaml
spec:
  runtimeClassName: gvisor
```

Before this field takes effect in GKE, the cluster must have gVisor support enabled.

For GCP-managed Kubernetes deployments:

1. Use GKE with a node pool that supports gVisor (GKE Sandbox / runsc-enabled nodes).
2. Confirm the runtime class exists:
   ```bash
   kubectl get runtimeclass gvisor
   ```
3. If missing, install RuntimeClass after runsc support is available on nodes:
   ```yaml
   apiVersion: node.k8s.io/v1
   kind: RuntimeClass
   metadata:
     name: gvisor
   handler: runsc
   ```

### 2) Service Account Token Mounting

Challenge pods are configured with:

```yaml
spec:
  automountServiceAccountToken: false
  enableServiceLinks: false
  serviceAccountName: ""
```

This does not conflict with current runtime behavior:

- The challenge container does not call the Kubernetes API.
- Session orchestration is performed by the backend/orchestrator service, not from inside challenge pods.
- Disabling the token mount reduces in-container blast radius without affecting challenge functionality.

If future scenario logic requires direct Kubernetes API access from inside challenge pods, that would be a policy conflict and must be explicitly reviewed before enabling token mounts.

### 3) API RBAC for Kubernetes Workspace Management

When the API runs in Kubernetes mode (`WORKSPACE_PROVIDER=kubernetes`), it must be able to create, delete, and exec into pods in `gitarena-sessions`.

Apply:

```bash
kubectl apply -f deploy/k8s/api-workspace-rbac.yaml
```

Then run the API deployment with:

- namespace: `gitarena-api`
- service account: `api-backend`

## Phase 3 Prerequisites (Network Isolation)

### 1) NetworkPolicy Enforcement by CNI

Phase 3 uses Kubernetes `NetworkPolicy` (`deploy/k8s/session-isolation-networkpolicy.yaml`) to enforce:

- ingress allowed only from `gitarena-api` pods labeled `app: api-backend` to port `7681`
- all egress denied for challenge pods

This requires a CNI implementation that enforces `NetworkPolicy`.

Examples:

- GKE Dataplane V2
- Calico
- Cilium

If your cluster does not enforce `NetworkPolicy`, the manifest applies but has no effect.

### 2) API Pod Label/Namespace Contract

The network policy allows ingress from:

- namespace: `gitarena-api`
- pod label: `app: api-backend`

Ensure your in-cluster API deployment matches both.

If API is running outside the cluster (for example on a developer laptop), session pod ingress on `7681` will be blocked by Phase 3 policy as designed.

## Phase 4 Prerequisites (Session Monitor + Resource Termination)

### 1) Kubernetes Metrics API (`metrics.k8s.io`)

Phase 4 monitor logic collects per-pod CPU and memory usage through the Kubernetes Metrics API:

- API path: `/apis/metrics.k8s.io/v1beta1/namespaces/<namespace>/pods/<pod>`
- Required for CPU/memory monitor triggers (`cpu_limit`, `memory_limit`)

For Kubernetes clusters, ensure `metrics-server` is installed and healthy:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top pods -n gitarena-sessions
```

If `kubectl top` fails, install or repair `metrics-server` before relying on Phase 4 enforcement.

### 2) API Runtime Permissions for Monitor Polling

When API runs with `WORKSPACE_PROVIDER=kubernetes`, the service account used by the API must be able to:

- read pod metrics (`metrics.k8s.io`)
- exec into session pods in `gitarena-sessions` (used for process-count and workspace-size checks)

Phase 2 RBAC (`deploy/k8s/api-workspace-rbac.yaml`) remains required.
