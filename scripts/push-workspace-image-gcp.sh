#!/usr/bin/env bash
set -Eeuo pipefail

# Build and push the hardened workspace image to Google Artifact Registry.

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
AR_LOCATION="${AR_LOCATION:-us-central1}"
AR_REPOSITORY="${AR_REPOSITORY:-gitarena}"
IMAGE_TAG="${IMAGE_TAG:-2.43.7-alpine3.19-v1}"

[[ -n "${GCP_PROJECT_ID}" ]] || { echo "FAIL: set GCP_PROJECT_ID" >&2; exit 1; }

IMAGE_URI="${AR_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}/gitarena-base:${IMAGE_TAG}"

echo "INFO: project=${GCP_PROJECT_ID}"
echo "INFO: image=${IMAGE_URI}"

gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
gcloud services enable artifactregistry.googleapis.com >/dev/null

gcloud artifacts repositories create "${AR_REPOSITORY}" \
  --repository-format=docker \
  --location="${AR_LOCATION}" \
  --description="GitArena workspace images" >/dev/null 2>&1 || true

gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet >/dev/null

docker build -f apps/workspace/Dockerfile -t "${IMAGE_URI}" apps/workspace
docker push "${IMAGE_URI}"

echo "PASS: pushed ${IMAGE_URI}"
