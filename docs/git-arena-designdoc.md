# GitArena — Engineering Design Document

**Version:** 0.1 — Initial Architecture
**Status:** Draft for Review
**Assumptions stated throughout. Where options diverge, a recommendation is made and justified.**

---

## 1. Product Goals

GitArena is a browser-based Git training platform where practitioners solve real, reproducible Git problems inside isolated containerized environments — not simulations. The system distinguishes itself from tutorial platforms by giving users an actual shell inside an actual repo, with real Git state, and scoring them on whether they actually fixed it.

Goals:

- **Real Git environments.** Users type real Git commands into a real shell. Nothing is mocked.
- **Scenario fidelity.** Every scenario is a deterministic, versioned, bootable repo state.
- **Fair, multi-path evaluation.** Many Git problems have more than one valid solution. The evaluator must accommodate this.
- **Progressive learning.** Users see history, progress, and completion status across a structured scenario catalog.
- **Authoring workflow.** Internal admins can write, test, and publish new scenarios without engineering involvement.
- **Polished UX.** The platform should feel serious and purposeful — not a toy.

---

## 2. Non-Goals (v1)

- No multiplayer or team challenges in v1. Architecture should leave room for it, but it won't be built.
- No in-browser IDE with language server support. Terminal-first. A lightweight code editor (Monaco read-only or simple textarea) is acceptable for file review, but not a full IDE.
- No AI-assisted hints in v1. Hint system is scaffolded but not powered.
- No mobile UX. Desktop browser is the target.
- No billing or subscription. Authentication gates access; monetization is out of scope.
- No replay/recording of user sessions in v1, though the session audit log is preserved.

---

## 3. User Journeys

**Journey A — New learner**

User discovers platform → signs in with Google → lands on dashboard showing scenario catalog → filters by difficulty or topic → clicks "Start" on a scenario → reads the brief and objective → environment spins up → user opens terminal → works through the challenge → submits → sees evaluation result with explanation → marks challenge complete → returns to catalog.

**Journey B — Returning learner**

User signs in → dashboard shows in-progress and completed scenarios, with score history → resumes or retries a past scenario → views hint if stuck → submits → sees delta from prior attempts.

**Journey C — Scenario author**

Admin signs in → navigates to authoring panel → creates new scenario draft → writes metadata (title, description, objective, difficulty) → writes a seed script that sets up the repo state → writes an evaluator script that checks correctness → uploads or triggers build of scenario image → previews the scenario in a test session → publishes → scenario appears in catalog.

---

## 4. Functional Requirements

### Authentication
- Google Sign-In via Firebase Authentication
- Firebase ID tokens verified on every API request
- Role model: `learner`, `admin`, `author`

### Scenario catalog
- Filterable by topic, difficulty, completion status
- Each scenario has a title, description, difficulty rating, estimated time, and topic tags
- Scenarios have lifecycle states: `draft`, `testing`, `published`, `deprecated`

### Challenge session
- Session is created on demand; container is provisioned with the scenario's Git state
- Browser terminal (xterm.js + WebSocket to container) connects within ≤10 seconds of "Start"
- Session has a timer; configurable per scenario (default 30 min)
- User can view the scenario objective panel alongside the terminal
- User can request a hint (stub in v1 — returns static text from scenario metadata)
- User can submit at any time or on timer expiry

### Evaluation
- Evaluation runs after submission
- Result: pass / fail with partial credit score (0–100)
- Explanation is returned showing which assertions passed or failed
- Result is stored in history

### Progress and history
- User sees all attempts per scenario with timestamps and scores
- Dashboard shows completion percentage and aggregate stats
- Leaderboard is optional in v1 (design for it, skip build)

### Authoring (admin)
- Scenario CRUD with metadata editor
- Seed script editor + upload
- Evaluator script editor + upload
- Image build trigger with build log viewer
- Preview session launch (same flow as learner, but scenario is in `testing` state)
- Publish / deprecate controls

---

## 5. Non-Functional Requirements

| Dimension | Target |
|---|---|
| Session startup | Terminal ready within 10s of "Start" click |
| Concurrent sessions | 500 simultaneous sessions in v1 |
| Container isolation | Each session runs in a separate, namespaced container |
| Session max lifetime | 60 minutes; idle timeout at 20 min inactivity |
| Evaluation time | Result returned within 10 seconds of submission |
| Availability | 99.5% uptime for platform; session infra degrades gracefully |
| Data retention | Attempt history retained indefinitely; container state ephemeral |
| Auth latency | Firebase token validation < 50ms (cached) |
| Scenario reproducibility | Given the same seed script and same evaluator, result must be identical across all environments |

---

## 6. High-Level Architecture

The system has five runtime domains:

- **Frontend** — React SPA served from CDN. Handles auth, catalog, terminal, result display.
- **API Gateway / Backend** — Node.js (Fastify) service. Handles auth verification, session lifecycle, scenario metadata, evaluation coordination, user state.
- **Session Orchestrator** — A separate internal service responsible for provisioning, monitoring, and terminating challenge containers.
- **Challenge Container** — An ephemeral container per session, containing the initialized Git repo and a shell exposed over WebSocket.
- **Evaluator Container** — A separate ephemeral container launched at submission time that runs the evaluator script against a snapshot of the challenge repo.

Supporting infrastructure: Firebase Auth (external), PostgreSQL (primary datastore), Redis (session state, token cache, pub/sub), S3-compatible object storage (scenario images, evaluator scripts, seed artifacts), and a container runtime (Kubernetes on GKE or EKS).

---

## 7. Authentication Flow

Firebase handles the identity provider relationship. The backend never trusts the frontend — every request carries a Firebase ID token which the backend verifies against Firebase's public keys (cached with a 1-hour TTL). On first verification of a new user, a `users` record is created with the Firebase UID as the primary key.

**Sequence:**

1. User clicks "Sign in with Google" → Firebase popup opens
2. Firebase returns an ID token to the browser
3. Browser sends `POST /auth/verify { idToken }` to the API backend
4. Backend verifies token against Firebase JWKS (cached)
5. Backend upserts `users` record (firebase_uid, email, display_name)
6. Backend issues its own session token (JWT, 8-hour expiry) as an `httpOnly` cookie
7. All subsequent requests carry the cookie — no Firebase roundtrip needed

**Session handling strategy:** After the initial Firebase token verification, the backend issues its own short-lived session token stored in an `httpOnly` cookie. Token refresh happens silently in the background. Firebase tokens are re-verified on session creation (not on every request) to keep latency down.

### Role Model

```
users.role: enum('learner', 'author', 'admin')
```

`admin` is a superset of `author`. Role is stored in the users table and included in the session token payload. Admin routes are gated server-side, not just client-side.

---

## 8. Detailed Subsystem Design

### 8.1 Session Orchestrator

The orchestrator is responsible for the full lifecycle of challenge containers. It is a separate service (not colocated with the API) to allow independent scaling and to contain the blast radius of container-related failures.

**Responsibilities:**
- Receive `CreateSession` commands from the API
- Allocate a container (from warm pool or cold launch)
- Initialize the repo state by running the scenario's seed script
- Expose a WebSocket endpoint for the terminal connection
- Monitor session health and idle timeout
- Receive `SubmitSession` commands: snapshot the repo state, hand it to the evaluator
- Receive `TerminateSession` commands or terminate on timeout
- Clean up container resources

**Container-per-session vs pool:** The design uses a **warm pool with cold-start fallback**. A small pool (configurable, default 10) of blank base containers is pre-warmed. On session creation, a blank container is claimed from the pool, the seed script is executed against it (typically 1–3 seconds), and the terminal is connected. When the pool is depleted, containers are cold-launched (5–8 second startup). After a session ends, the container is torn down (not recycled — recycling creates cross-contamination risk).

**Ephemeral vs persistent workspace:** All workspaces are **ephemeral**. There is no session resume — if the user's browser disconnects, the session stays alive on the server for 5 minutes awaiting reconnect. After that, it is terminated. Users can retry a scenario, but the environment is always freshly seeded.

**Remote repo simulation:** Many Git scenarios involve a "remote" (`origin`). Since containers are isolated, remotes are simulated by creating a bare repo directory within the same container filesystem (e.g. `/repos/origin.git`) and setting the remote URL to a local file path (`file:///repos/origin.git`). For multi-remote scenarios (e.g. `origin` + `upstream`), two bare repos are created. This is fully transparent to the user — `git remote -v` shows what the scenario author configured.

### Container Lifecycle States

```
[Warm pool] ──claimed──► [Seeding] ──ready──► [Active] ──submit──► [Evaluating] ──done──► [Terminated]
     ▲                                             │                                              ▲
     │                                             └──timeout/quit────────────────────────────────┘
[Cold launch] ──────────────────────────────────────────────────────►[Seeding]
```

Containers are never recycled — each session gets a fresh environment.

### 8.2 Browser Terminal Integration

**Recommendation: xterm.js + ttyd over WebSocket**

Options considered:

| Option | Verdict |
|---|---|
| xterm.js + custom WS relay | Maximum control, more plumbing |
| ttyd | Simple, WS-native, easy per-container deploy ✓ |
| VSCode Web / Theia | Heavyweight, overkill |
| CodeSandbox-style VM | Not appropriate for terminal-first Git training |

**Chosen approach:** ttyd running inside each challenge container, exposed on a per-container internal port. The API backend proxies the WebSocket connection through after verifying the user's session token. The user never connects directly to the container — all WebSocket traffic goes through the API layer.

ttyd is launched as: `ttyd -p 7681 --writable bash` inside the container, bound to localhost only. The orchestrator registers the container's internal IP and port in Redis when the session is created. The API backend resolves this and establishes the WebSocket proxy.

### 8.3 Scenario Packaging and Execution Model

Each scenario is represented by two artifacts:

**Seed script** — a bash script that creates the desired Git repo state from scratch. This runs inside the challenge container at session start. It must be:
- Idempotent (given a fresh container, always produces identical state)
- Self-contained (no network dependencies; all setup is local)
- Fast (target < 5 seconds)

Example seed script for a "detached HEAD recovery" scenario:

```bash
#!/bin/bash
set -e
mkdir -p /workspace && cd /workspace
git init
git config user.email "user@gitarena.dev"
git config user.name "Git Arena"
echo "Initial content" > README.md
git add . && git commit -m "Initial commit"
git tag v0.1
echo "Feature work" > feature.txt
git add . && git commit -m "Add feature"
# Leave user in detached HEAD
git checkout HEAD~1
```

**Evaluator script** — a bash script that runs against the final repo state. It emits structured output indicating which checks passed.

```bash
#!/bin/bash
cd /workspace
SCORE=0
TOTAL=3

# Check 1: user is on a branch (not detached)
if git symbolic-ref HEAD > /dev/null 2>&1; then
  echo "PASS:not_detached:User is on a named branch"
  SCORE=$((SCORE+1))
else
  echo "FAIL:not_detached:HEAD is still detached"
fi

# Check 2: feature commit is reachable
FEATURE_SHA=$(git log --all --oneline | grep "Add feature" | awk '{print $1}')
if [ -n "$FEATURE_SHA" ]; then
  echo "PASS:feature_reachable:Feature commit is in history"
  SCORE=$((SCORE+1))
else
  echo "FAIL:feature_reachable:Feature commit was lost"
fi

# Check 3: tag v0.1 still exists
if git tag | grep -q "^v0.1$"; then
  echo "PASS:tag_preserved:Tag v0.1 exists"
  SCORE=$((SCORE+1))
else
  echo "FAIL:tag_preserved:Tag v0.1 is missing"
fi

echo "SCORE:$SCORE/$TOTAL"
```

**Scenario image:** The base container image is a minimal Alpine Linux image with Git installed. Seed and evaluator scripts are stored in S3. They are NOT baked into the image — they are fetched and executed at runtime. This means scenarios can be updated without rebuilding the image. The image is versioned; a scenario's metadata references a specific image tag.

**Evaluator isolation:** The evaluator script runs in a **separate container** that mounts a read-only snapshot of the challenge repo (tar archive extracted into a tmpfs volume). This ensures the evaluator cannot modify the challenge workspace and that evaluation is fully reproducible.

---

## 9. Evaluation Engine Design

### 9.1 Comparison of Approaches

**Snapshot comparison (exact match)**
Compares the final repo bundle byte-for-byte against a reference. Extremely precise, but brittle — different valid solutions produce different DAGs and commit SHAs.
*Verdict: rejected as primary. Acceptable only for trivially deterministic scenarios.*

**Rule-based assertions (declarative)**
Assertions declared in YAML/JSON (e.g. `branch_exists: main`, `HEAD_is_branch: true`). Flexible and readable, but insufficient for complex commit graph topology checks.
*Verdict: good for simple scenarios; use as a secondary layer.*

**Scripted evaluator container (recommended)**
An arbitrary evaluator script (bash or Python) is executed inside an evaluator container with full git access. Outputs structured PASS/FAIL results. Most expressive option; no new DSL required.
*Verdict: primary approach.*

**Commit DAG analysis (graph-aware)**
Parse the Git object store directly using `pygit2` or `go-git`. Allows precise checks like "is the graph a linear sequence?" or "does this commit have exactly one parent?"
*Verdict: available as an optional helper library within the scripted evaluator.*

### 9.2 Recommended Approach: Scripted Evaluator with Structured Output

Each scenario has an `eval.sh` or `eval.py` script that runs inside an evaluator container. It emits line-delimited assertions in the format:

```
PASS:<check_id>:<human readable explanation>
FAIL:<check_id>:<human readable explanation>
SCORE:<n>/<total>
```

**Supporting library:** A Python helper module `gitarena_eval.py` is available inside the evaluator container, wrapping `pygit2` for common checks:

```python
from gitarena_eval import repo, assert_pass, score

r = repo('/workspace')
assert_pass('not_detached', not r.head_is_detached, 'HEAD must be on a named branch')
assert_pass('branch_linear', r.is_linear('main'), 'main must be a linear history')
score()
```

**Multiple valid solutions:** Evaluators check the *outcome*, not the *path*. If the goal is "clean up the last 3 commits into one", the evaluator checks file content and commit graph shape — regardless of whether the user used `rebase -i`, `reset` + `commit`, or `merge --squash`.

**Anti-cheat:** The evaluator container mounts the workspace **read-only**. The submission snapshot is taken server-side — the user cannot influence what is snapshotted. Container network access is disabled.

**Partial credit:** Each assertion has a weight (default: equal). Score = sum of passed assertion weights / total weight × 100.

**Retry behavior:** Users can retry a scenario. Prior attempts are preserved. After 3 retries, hints become available (if configured).

**Post-run explanation:** The full assertion list (with pass/fail and human-readable explanation) is returned to the frontend and displayed as a breakdown.

### Evaluation Pipeline

```
User submits
    │
    ▼
Snapshot workspace (tar /workspace → S3)
    │
    ▼
Launch evaluator container (mounts read-only snapshot)
    │
    ▼
eval.sh / eval.py runs
    │    └── optional: pygit2 helper for graph checks
    ▼
Parse PASS/FAIL output lines
    │
    ▼
Score computed from passed assertions
    │
    ▼
Result stored in attempts table + returned to browser
```

---

## 10. Data Model

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| firebase_uid | string | unique |
| email | string | |
| display_name | string | |
| role | enum | learner, author, admin |
| created_at | timestamp | |

### scenarios
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | string | |
| description | text | |
| objective | text | shown to user during challenge |
| difficulty | enum | beginner, intermediate, advanced |
| status | enum | draft, testing, published, deprecated |
| image_tag | string | pinned container image tag |
| seed_script_s3_key | string | |
| eval_script_s3_key | string | |
| time_limit_seconds | int | |
| tags | jsonb | array of strings |
| version | int | increments on script changes |
| created_by | uuid FK → users | |
| published_at | timestamp | |

### sessions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| scenario_id | uuid FK → scenarios | |
| status | enum | pending, active, submitted, evaluated, terminated |
| container_id | string | orchestrator-assigned |
| ws_token | string | single-use, 10-min TTL |
| started_at | timestamp | |
| submitted_at | timestamp | |
| terminated_at | timestamp | |
| elapsed_seconds | int | |
| hint_count | int | |

### attempts
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK → sessions | |
| user_id | uuid FK → users | |
| scenario_id | uuid FK → scenarios | |
| score | int | 0–100 final score |
| base_score | int | from evaluator |
| assertion_results | jsonb | full breakdown |
| evaluated_at | timestamp | |
| passed | bool | |

### hint_requests
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK → sessions | |
| hint_index | int | which hint was requested |
| requested_at | timestamp | |

**Key design notes:**

- `sessions` is the live runtime record, updated frequently during a challenge.
- `attempts` is the immutable audit record. One session produces exactly one attempt on submission.
- `scenarios.version` increments when seed or evaluator script changes. Attempts reference the scenario version at attempt time.
- `assertion_results` in `attempts` is a JSONB array of `{check_id, passed, explanation, weight}`.

---

## 11. Scenario Authoring and Publishing Flow

### Lifecycle States

```
[Draft] ──trigger build──► [Building] ──build ok──► [Testing] ──publish──► [Published] ──deprecate──► [Deprecated]
   ▲                            │                        │
   └────────build fail──────────┘                        │
   ◄──────────────────────eval fails / fix needed─────────┘
```

### Detailed Workflow

1. Author creates scenario draft with metadata (title, description, objective, difficulty, tags, time limit).
2. Author writes `seed.sh` in the browser editor (Monaco) and `eval.sh` in the same editor.
3. Author clicks **Build** — scripts are uploaded to S3, a validation job runs (bash syntax check, required output format check).
4. On build success, scenario moves to `testing`. Author clicks **Preview** — launches a full session identical to the learner flow. Author solves the challenge, submits, sees the evaluation result.
5. If the evaluation is wrong (too strict or too permissive), author returns to draft to iterate.
6. When satisfied, author clicks **Publish**. Scenario becomes visible in the catalog.

### Versioning

Updating `seed.sh` or `eval.sh` increments `scenarios.version`. Prior attempts retain their version reference. Published scenarios must transition back to `testing` before changes take effect — no hot-swapping in production.

---

## 12. API Design

**Base path:** `/api/v1`

**Authentication:** All routes require a valid session cookie except `POST /auth/verify`.

| Method | Path | Description | Role |
|---|---|---|---|
| POST | `/auth/verify` | Exchange Firebase ID token for session | public |
| DELETE | `/auth/session` | Sign out | learner+ |
| GET | `/scenarios` | List scenarios (filterable) | learner+ |
| GET | `/scenarios/:id` | Scenario detail | learner+ |
| GET | `/scenarios/:id/attempts` | Current user's attempts | learner+ |
| POST | `/sessions` | Start a challenge session | learner+ |
| GET | `/sessions/:id` | Session status + WS URL | learner+ |
| POST | `/sessions/:id/hint` | Request hint | learner+ |
| POST | `/sessions/:id/submit` | Submit session for evaluation | learner+ |
| DELETE | `/sessions/:id` | Abandon session | learner+ |
| GET | `/users/me` | Current user profile | learner+ |
| GET | `/users/me/history` | All attempts | learner+ |
| POST | `/admin/scenarios` | Create scenario draft | author+ |
| PUT | `/admin/scenarios/:id` | Update scenario | author+ |
| POST | `/admin/scenarios/:id/build` | Trigger build | author+ |
| POST | `/admin/scenarios/:id/preview` | Launch preview session | author+ |
| POST | `/admin/scenarios/:id/publish` | Publish scenario | admin |
| POST | `/admin/scenarios/:id/deprecate` | Deprecate scenario | admin |
| GET | `/admin/sessions` | List active sessions | admin |

**WebSocket endpoint:** `/ws/sessions/:id?token=<ws_token>`

The API backend proxies this to the container's ttyd process. The `ws_token` is a short-lived (10 minute), single-use token issued when the session is created.

**Evaluation result schema:**

```json
{
  "session_id": "uuid",
  "scenario_id": "uuid",
  "score": 82,
  "base_score": 75,
  "passed": true,
  "evaluated_at": "ISO8601",
  "assertions": [
    {"check_id": "not_detached", "passed": true, "explanation": "HEAD is on branch 'main'"},
    {"check_id": "feature_reachable", "passed": true, "explanation": "Feature commit found in history"},
    {"check_id": "tag_preserved", "passed": false, "explanation": "Tag v0.1 is missing"}
  ]
}
```

---

## 13. Frontend Architecture

**Framework:** React (Vite) with TypeScript. No Next.js in v1 — SSR adds complexity without meaningful benefit for a terminal-first app.

**State management:** Zustand for global state (auth, active session). React Query for server state (scenarios, attempts).

### Key Screens

| Route | Screen |
|---|---|
| `/` | Landing / sign-in |
| `/dashboard` | Catalog + progress overview |
| `/scenarios/:id` | Scenario detail page |
| `/sessions/:id` | Challenge workspace |
| `/sessions/:id/result` | Evaluation result |
| `/history` | All attempts |
| `/admin` | Admin panel (role-gated) |

### Challenge Workspace Layout

```
┌─────────────────────────────────────────────────────┐
│ Scenario title            Timer: 24:13    [Quit]    │
├──────────────────────────┬──────────────────────────┤
│                          │  Objective               │
│                          │  ─────────────           │
│    Terminal (xterm.js)   │  Fix the detached HEAD   │
│                          │  and recover the feature │
│                          │  branch.                 │
│                          │                          │
│                          │  [Hint]   [Submit]       │
└──────────────────────────┴──────────────────────────┘
```

The terminal panel is the primary real estate (70% width). The objective panel is collapsible. xterm.js is initialized with a custom theme matching the platform design.

**Terminal connection lifecycle:** On mount, the workspace component fetches session status (including `ws_url`). It then establishes a WebSocket to `/ws/sessions/:id?token=<ws_token>`. If the connection drops, it attempts 3 reconnects with exponential backoff before showing a "reconnecting" banner.

---

## 14. Security Model

### Container Isolation
- Each container runs as a non-root user with no capabilities beyond what bash requires
- No internet access from challenge containers (network namespace with no external egress)
- Containers cannot reach the API or orchestrator (separate network segment)
- Resource limits: 256MB RAM, 0.5 CPU, 1GB ephemeral disk
- Container runtime: **gVisor (runsc)** for stronger syscall-level isolation

### WebSocket Security
- WS connections require the `ws_token` (single-use, 10-minute TTL, stored in Redis)
- The API backend validates the token before establishing the proxy
- WS connections are rate-limited (1 active connection per session)

### Evaluator Isolation
- Evaluator containers mount the workspace snapshot read-only
- No network access
- 60-second timeout to prevent infinite loops in evaluator scripts
- Separate container from the challenge container

### Anti-Cheat
The submission snapshot is taken server-side via `docker exec tar ...` — the user cannot influence what is snapshotted. The evaluator mounts the snapshot, not the live container, so any post-submission modifications are irrelevant.

### Script Security
Seed and evaluator scripts are authored by trusted admins only. They run inside containers with no host mounts and no external network access.

---

## 15. Scalability and Operations

**Session concurrency:** 500 concurrent sessions in v1.
- Each session: ~256MB RAM, ~0.5 CPU
- 500 sessions ≈ 128GB RAM + 250 CPU cores
- On GKE n2-standard-8 nodes: ~16 nodes at full utilization
- Target 50–60% utilization: plan for 25–30 nodes

**Container pool:** Maintained by the orchestrator as a Kubernetes Deployment of blank containers. Pool scales with cluster node count (default 10 blank containers per 10 nodes). Orchestrator triggers scale-up when pool depth falls below 3.

**Scenario image caching:** Base container images are pulled to nodes at cluster startup using a DaemonSet. No cold-pull penalty per scenario — all scenarios share one base image in v1.

**Database:** PostgreSQL on Cloud SQL (managed). Read replicas for catalog and history queries. Connection pooling via PgBouncer sidecar.

**Redis:** Session state (container IP/port, WS tokens), Firebase JWKS cache, pub/sub for session lifecycle events. Redis Cluster with 3 shards.

**Object storage:** GCS or S3 for scenario seed scripts, evaluator scripts, and workspace snapshots. Snapshots are retained for 24 hours post-evaluation then deleted.

---

## 16. Failure Modes and Mitigations

| Failure | Impact | Mitigation |
|---|---|---|
| Container fails to start | Session creation fails | Retry with new container; surface error to user with retry button |
| WebSocket connection drops | User loses terminal | Client-side reconnect with 3-attempt backoff; session stays alive for 5 min |
| Seed script errors | Broken initial state | Seed script is validated in a test container before publishing |
| Evaluator script hangs | Result never returned | 60-second hard timeout; result becomes "evaluation timed out" with 0 score |
| Redis unavailable | Session lookup fails | Degrade to reading session state from PostgreSQL; alert ops |
| PostgreSQL unavailable | Write failures | Read-only mode with degraded UX; retry queue for writes |
| Container node pool exhausted | Sessions queue | Scale-up triggered; queue bounded (reject after 30-second wait) |
| Snapshot upload to S3 fails | Submission fails | Retry 3× with exponential backoff; session preserved for manual review if all fail |

---

## 17. Observability

### Metrics (Prometheus + Grafana)
- `sessions_active` — gauge of live sessions
- `session_startup_latency_seconds` — histogram (P50, P95, P99)
- `evaluation_latency_seconds` — histogram
- `container_pool_depth` — gauge
- `scenario_attempt_total` — counter by scenario and outcome
- `ws_connection_drops_total` — counter

### Tracing (OpenTelemetry → Tempo)
Trace spans for: session creation, seed execution, evaluation, WS proxy establishment.

### Logging (structured JSON → Loki)
- All API requests with user ID, session ID, latency, status
- Container lifecycle events (create, seed-start, seed-end, terminate)
- Evaluation run (scenario ID, score, assertion breakdown)
- Auth events (login, token refresh)

### Alerting
- `session_startup_p95 > 15s` — page on-call
- `container_pool_depth < 2` — warn
- `evaluation_errors_total rate > 5/min` — warn
- `ws_connection_drops rate > 20/min` — page

### Audit Log
All admin actions (publish, deprecate, role changes) are written to an immutable `audit_log` table with actor, action, target, and timestamp.

---

## 18. MVP Scope vs Future Scope

### MVP — smallest valuable v1

- Google sign-in (Firebase)
- Scenario catalog with 10 published scenarios covering the most common Git problem types
- Session creation, terminal (xterm.js + ttyd), submit, evaluate
- Scripted evaluator with PASS/FAIL output
- Attempt history per user
- Admin panel: scenario CRUD, build, preview, publish
- Single Kubernetes cluster on GCP
- Baseline observability (Prometheus, structured logs)

### Future scope

- Leaderboard / public rankings
- Hints system (field is stored, UI stub exists, no backend logic in v1)
- Team challenges
- AI-assisted hints
- Mobile UX
- Session replay
- Scenario import/export
- Custom evaluator DSL / GUI assertion builder
- Certificate generation
- LMS integration
- In-container HTTP Gitea server for credential auth scenarios

---

## 19. Risks and Tradeoffs

**Risk: Evaluator script quality determines platform credibility.**
If evaluators are too strict, users complain their valid solution was rejected. If too permissive, learning value is lost. Mitigations: author preview flow forces authors to solve their own scenarios before publishing; assertion explanations expose the rubric to users.

**Risk: Container cold-start latency degrades UX.**
Warm pool helps, but pool can be exhausted under traffic spikes. Mitigation: aggressive pool pre-warming, circuit breaker that queues sessions rather than failing.

**Risk: ttyd security.**
ttyd exposes a full bash shell. Users are already constrained to the container, but a malicious user could attempt container escape. Mitigations: non-root, dropped capabilities, no host mounts, Seccomp profile, gVisor as the container runtime (recommended).

**Risk: Scenario seed scripts become a maintenance burden.**
As Git versions evolve, behavior may change subtly. Mitigation: pin the Git version in the container image; test suite runs all seed + eval scripts against the pinned image on every image update.

**Tradeoff: Ephemeral sessions vs persistent sessions.**
Ephemeral is simpler and more secure. The cost is that users cannot resume mid-challenge after 5 minutes of disconnect. Acceptable for v1 — session lifetime is 30–60 min and most users complete in one sitting.

---

## 20. Recommended Tech Stack

| Layer | Choice | Justification |
|---|---|---|
| Frontend | React + Vite + TypeScript | Ecosystem, xterm.js integration, team familiarity |
| Terminal in browser | xterm.js | Industry standard, maintained, fits React well |
| UI component base | Radix UI + Tailwind CSS | Accessible, unstyled primitives, easy to theme |
| Backend | Node.js + Fastify | Fast, low-latency, good WebSocket proxy support |
| Auth | Firebase Auth (Google Sign-In) | Handles OAuth complexity |
| Primary database | PostgreSQL (Cloud SQL) | Relational, JSONB support, managed |
| Cache / session store | Redis (Memorystore) | Fast k/v, pub/sub for session events |
| Object storage | GCS or S3 | Scenario scripts, snapshots |
| Container runtime | Kubernetes (GKE) | Container orchestration, node autoscaling |
| Container sandbox | gVisor (runsc) | Stronger isolation for untrusted shell workloads |
| Shell-in-browser | ttyd | Simple, no native code, WS-native |
| Evaluator helper | Python + pygit2 | Git object graph introspection |
| Metrics | Prometheus + Grafana | Standard, integrates with GKE |
| Tracing | OpenTelemetry + Tempo | Vendor-neutral |
| Logging | Structured JSON → Loki | Query-friendly |
| CI/CD | GitHub Actions | Scenario image build pipeline, backend deploys |
| IaC | Terraform | Reproducible cloud infra |

---

## 21. Open Questions

1. **Concurrency limit per user:** Should a user be allowed to run two sessions simultaneously? Recommendation: no — one active session per user. Prevents abuse and simplifies session state.

2. **What happens to in-progress sessions when a scenario is deprecated?** Recommendation: existing sessions complete normally; no new sessions can start on a deprecated scenario.

3. **Should the workspace snapshot be retained after evaluation for dispute resolution?** Recommendation: yes, 7-day retention, accessible to admins only.

4. **How are remotes that require authentication modeled?** In-container remotes use local file paths — no auth needed. Scenarios that teach "configuring remote credentials" would need a local HTTP Git server (e.g. Gitea) running inside the container. Plan for this in v2.

5. **Hint content moderation:** In v2, hints could be AI-generated. Who approves them before they're shown to users?

6. **Team challenges:** The data model should track `team_id` on sessions in the future. Reserve the column as nullable in v1 migrations.

---

## Final Recommendation

Build this as a **scripted evaluator platform on Kubernetes, with ttyd-based browser terminals proxied through the API layer, using Firebase for auth and PostgreSQL for all persistent state.**

The core architectural choices that make this work:

- **Evaluator scripts, not a DSL** — expressive, testable, authorable without learning a new language.
- **gVisor** for container isolation — the additional syscall overhead is acceptable for a 30-minute session; the security gain is significant when handing out root-level bash shells.
- **Warm container pool** — session startup latency is the UX kingmaker. 1–3 seconds from "Start" to a responsive terminal will make the product feel professional. A 10-second cold start will make it feel broken.
- **Snapshot-then-evaluate** — clean separation between the challenge runtime and the evaluator runtime. The right boundary for security, reproducibility, and testability.
- **No session resume** — ephemeral sessions are simpler, safer, and sufficient. The timer is generous enough that almost no legitimate user needs resume.

The biggest v1 risk is evaluator quality. Invest in the author preview flow and the evaluator output format before building anything else. The terminal experience and the correctness of the scoring are the two things users will judge the platform on. Get both right before worrying about leaderboards, hints, or team features.
