# 05 - Workspace Runtime and Scenarios

This is the core of GitArena.

## Workspace Runtime Model

Each active session gets its own isolated runtime.

- Docker provider:
  - Container name: `<WORKSPACE_CONTAINER_PREFIX>-<sessionId>`
  - Runtime command starts a long-running shell process (`WORKSPACE_INIT_COMMAND`)
  - Container is started with hardening flags:
    - non-root user (`1000:1000`)
    - no network (`--network none`)
    - capabilities dropped and `no-new-privileges`
    - memory/cpu/pids limits aligned with policy envelope
- Kubernetes provider:
  - Pod name: `session-<sessionId>`
  - Pod spec is created by API with hardened security context
  - Runtime class defaults to `gvisor`
- Common:
  - Working directory: `WORKSPACE_ROOT` (default `/workspace`)
  - Shell: `WORKSPACE_SHELL` (default `/bin/bash`)

Creation path in code:

- `WorkspaceManager.ensureWorkspace(session)`
- checks existing running runtime
- recreates if missing
- runs scenario seed script

## Scenario Runtime Registry

`apps/api/src/scenario-runtime.ts` maps scenario id to script files:

- `seedPath` -> setup script
- `evaluatorPath` -> grading script

Scripts are cached in memory after first load for runtime efficiency.

## Scenario File Structure

Each scenario has its own folder:

```text
apps/api/scenarios/<scenario-id>/
  seed.sh
  eval.sh
```

Seed scripts:

- create deterministic repo state
- write helper metadata under `/workspace/.gitarena` when needed

Evaluator scripts:

- inspect repo state
- emit assertions in required format

## Assertion Output Contract

Evaluator must print one line per check:

```text
ASSERT:<checkId>:<PASS|FAIL>:<weight>:<explanation>
```

Example:

```text
ASSERT:head_attached:PASS:15:HEAD is attached to branch 'main'.
```

Parser in `workspace-manager.ts`:

- ignores non-matching lines
- converts valid lines into `AssertionResult[]`
- throws if zero assertions parsed

## Existing Scenarios

- `detached-head-recovery`
- `interactive-rebase-cleanup`
- `remote-divergence-resolution`

Scenario metadata is declared in `src/scenario-seed.ts` and seeded/upserted into DB by `Repository.init()`.

## Add a New Scenario

1. Create scripts:
- `apps/api/scenarios/<new-id>/seed.sh`
- `apps/api/scenarios/<new-id>/eval.sh`

2. Register runtime mapping in `src/scenario-runtime.ts`.

3. Add scenario metadata in `src/scenario-seed.ts`:
- id, title, description, objective
- difficulty, estimated time
- tags, hints, status

4. Restart API so initialization seeds/upserts new scenario.

5. Validate by creating session and submitting in UI or API.

## Terminal Interactivity Notes

Terminal bridge uses:

- browser xterm input -> websocket -> spawned process stdin
- spawned process is:
  - Docker: `script -qefc "docker exec -it ..."`
  - Kubernetes: `script -qefc "kubectl exec -it ..."`

This `script` wrapper is important because `docker exec -it` expects a TTY.

If terminal appears non-interactive:

- verify websocket route is upgraded:
  - Vite proxy mode (host-dev and compose): `/ws` proxy in `apps/web/vite.config.ts`
- verify runtime shell exists (`/bin/bash` default).
- inspect API logs for terminal spawn errors.
- inspect workspace runtime directly:

```bash
docker exec -it <container-name> /bin/bash -i
# or
kubectl -n gitarena-sessions exec -it <pod-name> -- /bin/bash -i
```

## Challenge Authoring Guidelines

- Keep seed deterministic and fast.
- Avoid network in seed/eval scripts.
- Use clear assertion ids and actionable failure text.
- Weights should sum to `100` for predictable scoring.
- Preserve multiple valid solution paths whenever possible (evaluate outcomes, not exact command sequence).
