# GitArena

Initial implementation scaffold based on `git-arena-designdoc.md`.

## Apps

- `apps/api` - Fastify API (`/api/v1`)
- `apps/web` - React + Vite frontend
- `packages/shared` - shared TypeScript types

## Docs

- Design doc: [`docs/git-arena-designdoc.md`](docs/git-arena-designdoc.md)
- Data model and scoring: [`docs/data-model-and-scoring.md`](docs/data-model-and-scoring.md)
- GCP & K8s CLI reference: [`docs/gcp-reference.md`](docs/gcp-reference.md)
- Workspace security policy: [`docs/workspace-policy.md`](docs/workspace-policy.md)
- K8s deployment: [`deploy/k8s/README.md`](deploy/k8s/README.md)
- Autopilot migration: [`docs/autopilot-migration.md`](docs/autopilot-migration.md)
- Internet test exposure: [`docs/internet-test-setup.md`](docs/internet-test-setup.md)

## Workflow Modes

- **Test stack (`docker compose up --build`)**
  - Uses containerized API + web preview build.
  - Intended for internet-exposed testing/showcase.
  - Host ports: `TEST_WEB_PORT` (default `5173`) and `TEST_API_PORT` (default `3001`).
  - Shortcuts: `npm run test:up`, `npm run test:logs`, `npm run test:down`.
- **Dev stack (`./scripts/dev-up.sh ...`)**
  - Uses host-run hot-reload API/web processes.
  - Intended for coding/debugging loops.
  - Host ports: `DEV_WEB_PORT` (default `5174`) and `DEV_API_PORT` (default `3002`).
  - Shortcuts: `npm run dev`, `npm run dev:logs`, `npm run dev:down`.

## Quick start

```bash
# optional (if using nvm): nvm use 24 || nvm install 24
npm install
cp .env.example .env
npm run dev
npm run dev:logs
```

Or run each app separately:

```bash
cp .env.example .env
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api docker
./scripts/dev-up.sh web
```

Required env for auth:

- `GOOGLE_CLIENT_ID` (API token audience validation)
- `VITE_GOOGLE_CLIENT_ID` (frontend Google Sign-In button)

Validate env key consistency:

```bash
npm run env:lint
```

Env surfaces are intentionally reduced to:

- `.env` for local/dev runtime
- `deploy/k8s/api-deploy.env` for GKE API deployment (local-only, generated from `.example`)

Port envs:

- Test stack: `TEST_WEB_PORT`, `TEST_API_PORT`
- Host dev stack: `DEV_WEB_PORT`, `DEV_API_PORT`

Run API scoring tests:

```bash
npm run test -w @gitarena/api
```

Publish scenario scripts to DB-backed revisions:

```bash
npm run scenario:publish -- --id detached-head-recovery
```

## Test Stack (Docker Compose)

Build and run the full stack:

```bash
docker compose up --build
# or
npm run test:up
```

Endpoints:

- Web app: `http://localhost:5173` (override with `TEST_WEB_PORT`)
- API readiness: `http://localhost:3001/api/v1/health/ready` (override with `TEST_API_PORT`)

Stop and remove containers:

```bash
docker compose down
# or
npm run test:down
```

Common test stack commands:

```bash
npm run test:up
npm run test:logs
npm run smoke:stack
npm run test:down
```

Run smoke test directly:

```bash
npm run smoke:stack
```

Provider-specific smoke variants:

```bash
npm run smoke:stack:docker
npm run smoke:stack:k8s
```

## Dev Helper Scripts

For host-based dev loops, primary entrypoints are in [`scripts/README.md`](scripts/README.md):

- `./scripts/dev-up.sh`
- `./scripts/dev-down.sh`

## Current status

This is a bootstrap foundation with:

- PostgreSQL-backed scenario/session persistence
- API liveness/readiness health endpoints
- Graceful API shutdown handling
- Hint + submit + evaluation pipeline with scenario-specific shell evaluators
- Attempt history persisted per user
- Static scenario-authored hints served progressively per session
- Docker-backed workspace container provisioning per active session
- Scenario seed scripts that create a real Git challenge repository per workspace
- Scenario runtime is DB-backed with immutable scenario revisions; local files are published via `scenario:publish`
- Interactive terminal over websocket at session workspace route
- Dashboard, workspace, result, and history routes
- Google Sign-In with server-side session cookies and per-user API isolation
- CSRF tokens enforced for mutating authenticated API routes

## API routes (current)

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/health`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/:id`
- `GET /api/v1/scenarios/:id/attempts`
- `GET /api/v1/users/me/active-session`
- `POST /api/v1/sessions`
  - Returns `409` if user already has an `active`/`submitted` session.
- `GET /api/v1/sessions/:id`
- `DELETE /api/v1/sessions/:id`
- `POST /api/v1/sessions/:id/hint`
- `POST /api/v1/sessions/:id/submit`
- `GET /api/v1/sessions/:id/result`
- `GET /api/v1/users/me/history`
- `WS /ws/sessions/:id?token=<wsToken>`

## Workspace Runtime Notes

- The API supports two workspace providers via `WORKSPACE_PROVIDER`:
  - `docker` (default for local dev)
  - `kubernetes` (GKE/K8s pod-backed sessions)
- Docker mode provisions one container per active session using the host Docker socket.
  - Docker runtime is hardened with:
    - `--network none`
    - `--user 1000:1000`
    - `--cap-drop ALL`
    - `--security-opt no-new-privileges`
    - resource limits (`memory/cpu/pids`)
- Kubernetes mode provisions one pod per active session in `WORKSPACE_K8S_NAMESPACE`.
- Optional safe migration support: set `WORKSPACE_K8S_CONTEXT` (and optionally `WORKSPACE_K8S_KUBECONFIG`) to target a separate sessions cluster while keeping API deployment unchanged.
- Kubernetes network isolation policy manifest is available at:
  - `deploy/k8s/session-isolation-networkpolicy.yaml`

## Notes

- `GET /api/v1/scenarios` and `GET /api/v1/scenarios/:id` are public.
- Session, attempt, and history routes require an authenticated cookie session.

## Roadmap

### Highest Priority

1. Phase 4 — session monitor and resource-triggered termination
2. Phase 5 — seed script validation pipeline for scenario builds
3. Phase 6 — snapshot/evaluator separation with object storage snapshots
4. Phase 7 — structured audit logging and ops runbook queries

### Security Gaps

- Phase 3 network policy enforcement depends on a CNI that supports `NetworkPolicy` (Calico/Cilium/Dataplane V2)
- Docker provider applies `--network none` but does not emulate K8s namespace/label policy semantics
- No session monitor loop for idle/resource termination yet
- Evaluator not yet split into separate snapshot-driven runtime (Phase 6)
- Full security audit event taxonomy not yet implemented

### Product / Platform Gaps

- Role-based access (`learner/author/admin`) is incomplete
- Scenario authoring admin build/publish workflow is incomplete
- Richer observability dashboards/alerts not yet implemented

### Testing Gaps

- Integration tests for Kubernetes provider paths
- Regression tests for websocket attach across provider modes
- Tests for provider-specific failure behavior (pod ready timeout, image pull failure)
- Tests for Phase 3+ security controls
