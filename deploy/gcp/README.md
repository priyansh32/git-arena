# GCP Deployment Assets

This directory is reserved for long-lived GCP infrastructure assets (for example Terraform or deployment manifests).

Current cluster/bootstrap operations are script-driven via:

- `scripts/gcp-init.sh`
- `scripts/gcp-verify.sh`
- `scripts/gcp-teardown.sh`

If GCP deployment config files are added later, keep this directory as the canonical location.
