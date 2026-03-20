# 08 - Development Workflow and Testing

This is the recommended day-to-day engineering loop.

## Build and Run Commands

From repo root:

```bash
npm install
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api docker
./scripts/dev-up.sh web
```

Alternative direct npm dev commands:

```bash
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm run typecheck
```

Helper scripts:

```bash
./scripts/dev-up.sh postgres
./scripts/dev-up.sh api docker
./scripts/dev-up.sh api k8s
./scripts/dev-up.sh web
./scripts/dev-down.sh all
```

Containerized flow:

```bash
./launch.sh start
./launch.sh logs
./launch.sh smoke
./launch.sh stop
```

## Testing

Current automated tests are focused on evaluation scoring:

```bash
npm run test -w @gitarena/api
```

Smoke test for integrated stack:

```bash
npm run smoke:stack
npm run smoke:stack:docker
npm run smoke:stack:k8s
```

Smoke script validates:

- health endpoints
- session create conflict behavior
- workspace runtime startup (docker container or k8s pod)
- seeded repo presence
- workspace runtime cleanup on delete

Security verification scripts:

```bash
./scripts/gcp-init.sh
./scripts/gcp-verify.sh
./scripts/verify-docker-security.sh
./scripts/gcp-teardown.sh
```

## Suggested Manual QA Checklist

Before merging major changes:

1. Start stack and open dashboard.
2. Launch each scenario once.
3. Verify terminal accepts input and prints output.
4. Request hint and confirm hint count increments.
5. Submit scenario and verify result breakdown.
6. Confirm history page shows attempt.
7. Confirm quitting session removes workspace container.

## When Changing Scenario Runtime

Always verify these after edits in `workspace-manager.ts` or scenario scripts:

- runtime is created with expected name prefix
- `/workspace` is a git repo after seed
- evaluator prints parseable `ASSERT:` lines
- runtime is removed on submit/quit

## Branching and Commits

- Keep changes scoped and commit in small logical units.
- Use descriptive commit messages tied to behavior.
- Avoid mixing unrelated refactors with runtime fixes.

Recommended message style:

- `feat: add scenario runtime docs`
- `fix: keep terminal websocket interactive`
- `chore: expand smoke stack checks`

## Code Change Touchpoints

When adding platform features:

- API contract changes -> update `packages/shared` first.
- Backend route/repo updates -> update `apps/api`.
- Frontend usage -> update `apps/web`.
- Runtime/ops impact -> update compose/scripts/docs together.
