# GCP & Kubernetes CLI Reference

Cheat sheet for GCP commands used throughout this project.

## gcloud — Cluster Management

```bash
# Create GKE Autopilot cluster
gcloud container clusters create-auto <cluster-name> \
  --region us-central1 --project <project-id>

# Get credentials (adds context to kubeconfig)
gcloud container clusters get-credentials <cluster-name> \
  --region us-central1 --project <project-id>

# List clusters
gcloud container clusters list --project <project-id> \
  --format='table(name,location,status,autopilot.enabled)'

# Describe a cluster
gcloud container clusters describe <cluster-name> \
  --region us-central1 --project <project-id>
```

## gcloud — Secret Manager

```bash
# Create a secret
gcloud secrets create <secret-name> --replication-policy="automatic"

# Add a version from file
gcloud secrets versions add <secret-name> --data-file=<path>

# List versions
gcloud secrets versions list <secret-name> --limit=5 \
  --format='table(name,state,createTime)'

# Describe a secret
gcloud secrets describe <secret-name>
```

## gcloud — Auth Plugin

Required for kubectl to authenticate against GKE:

```bash
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```

If `kubectl` complains about a missing auth plugin, install it:

```bash
gcloud components install gke-gcloud-auth-plugin
```

## kubectl — Context & Config

```bash
# Show current context
kubectl config current-context

# List all contexts
kubectl config get-contexts

# Use a specific context inline
kubectl --context <context-name> get pods

# GKE context naming convention
# gke_<project-id>_<zone-or-region>_<cluster-name>
# e.g. gke_git-arena-490721_us-central1_git-arena-autopilot
```

## kubectl — Namespaces

This project uses two namespaces:
- `gitarena-api` — API deployment
- `gitarena-sessions` — challenge session pods

```bash
kubectl create namespace gitarena-sessions \
  --dry-run=client -o yaml | kubectl apply -f -
```

## kubectl — Pods

```bash
# List session pods
kubectl -n gitarena-sessions get pods

# Watch pods in real time
kubectl -n gitarena-sessions get pods -w

# Describe for debugging
kubectl -n gitarena-sessions describe pod <pod-name>

# Exec into a session pod
kubectl -n gitarena-sessions exec -it <pod-name> -- /bin/bash -i

# Pod metrics (requires metrics-server)
kubectl top pods -n gitarena-sessions

# Check metrics API is available
kubectl get apiservice v1beta1.metrics.k8s.io
```

## kubectl — Secrets

```bash
# Create secret from file (idempotent with dry-run pipe)
kubectl -n gitarena-api create secret generic gitarena-session-kubeconfig \
  --from-file=config=/path/to/kubeconfig \
  --dry-run=client -o yaml | kubectl apply -f -

# Extract a token from a secret
kubectl -n gitarena-sessions get secret session-controller-token \
  -o jsonpath='{.data.token}' | base64 -d

# Extract cluster server/CA from kubeconfig
kubectl config view --raw \
  -o jsonpath="{.clusters[?(@.name==\"<context>\")].cluster.server}"
kubectl config view --raw \
  -o jsonpath="{.clusters[?(@.name==\"<context>\")].cluster.certificate-authority-data}"
```

## kubectl — RBAC & Auth

```bash
# Apply RBAC for API pod management
kubectl apply -f deploy/k8s/api-workspace-rbac.yaml

# Check permissions
kubectl --kubeconfig <path> --context <context> \
  -n gitarena-sessions auth can-i create pods

# Verify gVisor RuntimeClass exists
kubectl get runtimeclass gvisor
```

## kubectl — Deployments

```bash
# Apply manifests with envsubst
set -a && source deploy/k8s/api-deploy.env && set +a
envsubst < deploy/k8s/api-deploy.yaml | kubectl apply -f -

# Check rollout status
kubectl -n gitarena-api rollout status deployment/gitarena-api

# Apply session network policy
kubectl apply -f deploy/k8s/session-isolation-networkpolicy.yaml
```

## kubectl — Node Management

```bash
# Taint control-plane nodes for API affinity
kubectl taint nodes -l cloud.google.com/gke-nodepool=control-plane \
  dedicated=api:NoSchedule --overwrite
```

Node pool labels used in this project:
- `cloud.google.com/gke-nodepool=control-plane` — API pods
- `cloud.google.com/gke-nodepool=sandbox-pool` — session pods

## Artifact Registry — Docker Images

Image URI format: `<location>-docker.pkg.dev/<project>/<repo>/<image>:<tag>`

```bash
# Build workspace image
docker build -f apps/workspace/Dockerfile \
  -t gitarena-base:2.43.7-alpine3.19-v1 apps/workspace

# Tag for Artifact Registry
docker tag gitarena-base:2.43.7-alpine3.19-v1 \
  us-central1-docker.pkg.dev/<project-id>/gitarena/gitarena-base:2.43.7-alpine3.19-v1

# Push
docker push \
  us-central1-docker.pkg.dev/<project-id>/gitarena/gitarena-base:2.43.7-alpine3.19-v1

# Configure docker auth for AR
gcloud auth configure-docker us-central1-docker.pkg.dev
```

Defaults (from `scripts/lib/common.sh`):
- Location: `us-central1`
- Repository: `gitarena`
- Image name: `gitarena-base`
- Tag: `2.43.7-alpine3.19-v1`

## Cloud SQL

Connection via sidecar proxy in K8s:

```yaml
# Sidecar container in api-deploy.yaml
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.18.2
  args:
    - "--structured-logs"
    - "--private-ip"
    - "--port=5432"
    - "${INSTANCE_CONNECTION_NAME}"
```

`INSTANCE_CONNECTION_NAME` format: `<project>:<region>:<instance>`

Local dev uses direct postgres (no proxy needed).

## Workload Identity

API pods use GCP Workload Identity for Cloud SQL access:

```yaml
# ServiceAccount annotation in api-workspace-rbac.yaml
iam.gke.io/gcp-service-account: ${GCP_API_GSA_EMAIL}
```

`GCP_API_GSA_EMAIL` format: `<sa-name>@<project-id>.iam.gserviceaccount.com`

## envsubst — Template Rendering

Used for K8s manifest templating. Load env then substitute:

```bash
set -a
source deploy/k8s/api-deploy.env
set +a
envsubst < deploy/k8s/api-deploy.yaml | kubectl apply -f -
```

Template variables use `${VAR}` syntax. See `deploy/k8s/api-deploy.env.example` for the full list.

## Kubeconfig Creation (Cross-Cluster)

For running session pods in a separate cluster, build a minimal kubeconfig:

```bash
# Extract credentials from target cluster
TOKEN=$(kubectl --context <target-ctx> -n gitarena-sessions \
  get secret session-controller-token -o jsonpath='{.data.token}' | base64 -d)
SERVER=$(kubectl config view --raw \
  -o jsonpath="{.clusters[?(@.name==\"<target-ctx>\")].cluster.server}")
CA=$(kubectl config view --raw \
  -o jsonpath="{.clusters[?(@.name==\"<target-ctx>\")].cluster.certificate-authority-data}")

# Write minimal kubeconfig
cat > /tmp/session-kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters:
- name: sessions
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA}
contexts:
- name: sessions
  context:
    cluster: sessions
    namespace: gitarena-sessions
    user: session-controller
current-context: sessions
users:
- name: session-controller
  user:
    token: ${TOKEN}
EOF

# Upload to Secret Manager
gcloud secrets versions add gitarena-session-kubeconfig \
  --data-file=/tmp/session-kubeconfig

# Or create as K8s secret for API pod mount
kubectl -n gitarena-api create secret generic gitarena-session-kubeconfig \
  --from-file=config=/tmp/session-kubeconfig \
  --dry-run=client -o yaml | kubectl apply -f -
```
