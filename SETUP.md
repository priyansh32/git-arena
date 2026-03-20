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
