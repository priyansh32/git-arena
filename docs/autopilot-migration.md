# Autopilot Sessions Migration (No-Break Plan)

This runbook migrates **session pods** to a separate GKE Autopilot cluster while keeping the current API deployment path intact until final cutover.

## Scope

- Keep `gitarena-api` serving traffic on current cluster/ingress.
- Move only `challenge-session` pod lifecycle target to a new cluster.
- Cut over with an explicit env switch and fast rollback.

## 1) Provision Autopilot Sessions Cluster

```bash
gcloud container clusters create-auto gitarena-sessions-ap \
  --region us-central1 \
  --project <project-id>
```

Fetch credentials and confirm context:

```bash
gcloud container clusters get-credentials gitarena-sessions-ap \
  --region us-central1 \
  --project <project-id>
kubectl config get-contexts
```

## 2) Prepare Sessions Cluster

Apply required namespaces and policy manifests to the Autopilot cluster context.

```bash
kubectl --context <autopilot-context> create namespace gitarena-sessions --dry-run=client -o yaml | kubectl --context <autopilot-context> apply -f -
kubectl --context <autopilot-context> create namespace gitarena-api --dry-run=client -o yaml | kubectl --context <autopilot-context> apply -f -
kubectl --context <autopilot-context> apply -f deploy/k8s/session-isolation-networkpolicy.yaml
```

Note: `challenge-session` pods already use `runtimeClassName: gvisor` in app code.

## 3) Wire API for Cross-Cluster Session Control

The API now supports:

- `WORKSPACE_K8S_CONTEXT`
- `WORKSPACE_K8S_KUBECONFIG`

Deployment template includes optional kubeconfig secret mount at:

- `/var/run/gitarena-session-kubeconfig/config`

Create/update secret in `gitarena-api` namespace:

```bash
kubectl -n gitarena-api create secret generic gitarena-session-kubeconfig \
  --from-file=config=/path/to/kubeconfig \
  --dry-run=client -o yaml | kubectl apply -f -
```

Set in `deploy/k8s/api-deploy.env`:

```bash
WORKSPACE_K8S_CONTEXT=<autopilot-context>
WORKSPACE_K8S_KUBECONFIG=/var/run/gitarena-session-kubeconfig/config
```

Redeploy API template:

```bash
set -a
source deploy/k8s/api-deploy.env
set +a
envsubst < deploy/k8s/api-deploy.yaml | kubectl apply -f -
kubectl -n gitarena-api rollout status deployment/gitarena-api
```

## 4) Verify Before Cutover

- Create a new session from UI.
- Confirm pod lands in Autopilot cluster:

```bash
kubectl --context <autopilot-context> -n gitarena-sessions get pods -w
```

- Verify terminal works and submit flow completes.
- Verify old cluster no longer receives new session pods.

## 5) Rollback (Immediate)

If anything fails, set:

```bash
WORKSPACE_K8S_CONTEXT=
WORKSPACE_K8S_KUBECONFIG=
```

Redeploy API (`envsubst | kubectl apply`) to return to same-cluster session management.

## 6) Finalize

After stable validation window:

- keep Autopilot as sessions target,
- retire old sandbox-only session path/pool if no longer needed.
