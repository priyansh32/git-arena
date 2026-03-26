# API Reference

Base URL: `/api/v1`
WebSocket base: `ws://<host>/ws`

All request and response bodies are JSON. Timestamps are ISO 8601 strings.

---

## Authentication

GitArena uses **httpOnly session cookies** for authentication. The login flow returns a CSRF token that must be sent on every mutating request.

### CSRF Protection

All `POST`, `PUT`, `PATCH`, and `DELETE` requests (except `POST /auth/google`) require the CSRF token in the request header:

```
x-gitarena-csrf: <csrfToken>
```

The CSRF token is returned on login and by `GET /users/me`.

---

## Health

### `GET /api/v1/health`

General health check.

**Auth required:** No

**Response `200`**
```json
{ "status": "ok" }
```

**Response `503`**
```json
{ "status": "error" }
```

---

### `GET /api/v1/health/live`

Liveness probe. Returns `200` as long as the process is running.

**Auth required:** No

**Response `200`**
```json
{ "status": "ok", "service": "api" }
```

---

### `GET /api/v1/health/ready`

Readiness probe. Checks database connectivity.

**Auth required:** No

**Response `200`**
```json
{ "status": "ok", "db": "up" }
```

**Response `503`**
```json
{ "status": "error", "db": "down" }
```

---

## Auth

### `POST /api/v1/auth/google`

Exchange a Google ID token for a GitArena session.

**Auth required:** No
**CSRF required:** No

**Request body**
```json
{
  "idToken": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `idToken` | `string` | Google Sign-In ID token obtained from the browser |

**Response `200`**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Smith",
    "avatarUrl": "https://...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "csrfToken": "string"
}
```

Sets a `gitarena_session` httpOnly cookie on success.

**Response `401`** — Invalid or expired Google ID token
**Response `403`** — Email not on the allowlist (test-mode environments only)

---

### `POST /api/v1/auth/logout`

Invalidate the current session.

**Auth required:** Yes
**CSRF required:** Yes

**Response `200`**
```json
{ "ok": true }
```

Clears the `gitarena_session` cookie.

---

## Users

### `GET /api/v1/users/me`

Return the currently authenticated user and a fresh CSRF token.

**Auth required:** No (returns `null` fields when unauthenticated)

**Response `200` — authenticated**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Smith",
    "avatarUrl": "https://...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "csrfToken": "string"
}
```

**Response `200` — unauthenticated**
```json
{ "user": null, "csrfToken": null }
```

---

### `GET /api/v1/users/me/active-session`

Return the caller's current active session, if one exists.

**Auth required:** Yes

**Response `200`**
```json
{
  "session": {
    "id": "uuid",
    "userId": "uuid",
    "scenarioId": "string",
    "status": "active",
    "startedAt": "2024-01-01T00:00:00.000Z",
    "wsUrl": "ws://...",
    "wsToken": "string",
    "expiresAt": "2024-01-01T01:00:00.000Z",
    "hintCount": 0
  }
}
```

`session` is `null` when no active session exists.

**Response `401`** — Not authenticated

---

### `GET /api/v1/users/me/history`

List all past attempts for the authenticated user, newest first.

**Auth required:** Yes

**Response `200`**
```json
{
  "attempts": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "userId": "uuid",
      "scenarioId": "string",
      "score": 85,
      "baseScore": 100,
      "passed": true,
      "assertions": [
        {
          "checkId": "string",
          "passed": true,
          "explanation": "string",
          "weight": 50
        }
      ],
      "evaluatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Response `401`** — Not authenticated

---

## Scenarios

### `GET /api/v1/scenarios`

List all published scenarios.

**Auth required:** No

**Response `200`**
```json
{
  "scenarios": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "objective": "string",
      "difficulty": "beginner",
      "commonality": "common",
      "estimatedTimeMinutes": 15,
      "tags": ["rebase", "conflict"],
      "hints": ["string"],
      "status": "published",
      "workspaceType": "string"
    }
  ]
}
```

**Difficulty values:** `beginner` | `intermediate` | `advanced`
**Commonality values:** `very_common` | `common` | `occasional` | `rare`
**Status values:** `draft` | `testing` | `published` | `deprecated`

---

### `GET /api/v1/scenarios/:id`

Fetch a single scenario by ID.

**Auth required:** No

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Scenario ID |

**Response `200`**
```json
{
  "scenario": { ... }
}
```

Same shape as entries in the list response above.

**Response `404`** — Scenario not found

---

### `GET /api/v1/scenarios/:id/attempts`

List all attempts the authenticated user has made on a specific scenario.

**Auth required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Scenario ID |

**Response `200`**
```json
{
  "attempts": [ ... ]
}
```

Same `Attempt` shape as `GET /users/me/history`.

**Response `401`** — Not authenticated
**Response `404`** — Scenario not found

---

## Sessions

A **session** represents one attempt at a scenario. It progresses through these statuses:

```
pending → active → submitted → evaluated
                ↘ terminated
```

### `POST /api/v1/sessions`

Start a new session for a scenario. Provisions a sandboxed workspace container.

**Auth required:** Yes
**CSRF required:** Yes

**Request body**
```json
{
  "scenarioId": "string"
}
```

**Response `201`**
```json
{
  "session": {
    "id": "uuid",
    "userId": "uuid",
    "scenarioId": "string",
    "status": "active",
    "startedAt": "2024-01-01T00:00:00.000Z",
    "wsUrl": "ws://<host>/ws/sessions/<id>",
    "wsToken": "string",
    "expiresAt": "2024-01-01T01:00:00.000Z",
    "hintCount": 0
  }
}
```

Use `wsUrl` and `wsToken` to connect the terminal WebSocket (see [Terminal WebSocket](#terminal-websocket)).

**Response `401`** — Not authenticated
**Response `404`** — Scenario not found or not published
**Response `409`** — User already has an active session
```json
{
  "message": "Finish or quit your active session before starting another.",
  "session": { ... }
}
```
**Response `503`** — Workspace container could not be provisioned

---

### `GET /api/v1/sessions/:id`

Fetch a session by ID. Also ensures the workspace is running if the session is active.

**Auth required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Response `200`**
```json
{
  "session": { ... }
}
```

**Response `401`** — Not authenticated
**Response `404`** — Session not found or belongs to another user
**Response `503`** — Workspace unavailable

---

### `DELETE /api/v1/sessions/:id`

Quit (terminate) an active session without scoring it. Stops and removes the workspace container.

**Auth required:** Yes
**CSRF required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Response `200`**
```json
{
  "session": { ... }
}
```

**Response `401`** — Not authenticated
**Response `404`** — Session not found or already closed

---

### `POST /api/v1/sessions/:id/submit`

Submit a session for evaluation. Runs the scenario evaluator inside the workspace, computes a score, and stops the container.

**Auth required:** Yes
**CSRF required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Response `200`**
```json
{
  "attempt": {
    "id": "uuid",
    "sessionId": "uuid",
    "userId": "uuid",
    "scenarioId": "string",
    "score": 85,
    "baseScore": 100,
    "passed": true,
    "assertions": [
      {
        "checkId": "string",
        "passed": true,
        "explanation": "Human-readable result message",
        "weight": 50
      }
    ],
    "evaluatedAt": "2024-01-01T00:00:00.000Z"
  },
  "session": { ... }
}
```

`score` is `baseScore` adjusted for hints used. `passed` is `true` when all required assertions pass.

**Response `401`** — Not authenticated
**Response `404`** — Session not found or belongs to another user
**Response `503`** — Workspace or evaluator unavailable

---

### `GET /api/v1/sessions/:id/result`

Fetch the evaluation result for a previously submitted session.

**Auth required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Response `200`**

Same shape as the `POST /submit` response.

**Response `401`** — Not authenticated
**Response `404`** — Result not found

---

### `POST /api/v1/sessions/:id/hint`

Request the next hint for the active session. Each hint reduces the final score.

**Auth required:** Yes
**CSRF required:** Yes

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Response `200`**
```json
{
  "hintIndex": 0,
  "hint": "Try using git rebase -i HEAD~3",
  "session": { ... }
}
```

`hintIndex` is zero-based. `session.hintCount` is incremented.

**Response `401`** — Not authenticated
**Response `404`** — Session not found, inactive, or no more hints available

---

## Terminal WebSocket

### `WS /ws/sessions/:id`

Attach an interactive terminal to the workspace container for a session.

**Auth required:** Yes (session cookie + `token` query parameter)

**Path parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | Session ID |

**Query parameters**

| Parameter | Description |
|-----------|-------------|
| `token` | The `wsToken` returned when the session was created |

**Authentication**

The WebSocket connection authenticates using two mechanisms:
1. The `gitarena_session` cookie (sent automatically by the browser)
2. The `token` query parameter (`session.wsToken`)

**Framing**

All frames are plain UTF-8 text:

- **Client → Server:** raw terminal input (keystrokes, control sequences)
- **Server → Client:** raw terminal output (stdout + stderr from the shell)

The server sends a ping frame every 25 seconds. If two consecutive pongs are missed the connection is closed.

**Close codes**

| Code | Reason |
|------|--------|
| `1000` | Terminal or session closed normally |
| `1008` | Authentication failure or invalid token |
| `1011` | Workspace or terminal error |

---

## Error Responses

All error responses share this shape:

```json
{
  "message": "Human-readable error description"
}
```

Validation errors (HTTP `400`) include an `issues` array:

```json
{
  "message": "Validation failed",
  "issues": [
    {
      "code": "too_small",
      "path": ["scenarioId"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

---

## Data Models

### `UserProfile`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique user ID |
| `email` | `string` | Google email address |
| `displayName` | `string` | Display name from Google profile |
| `avatarUrl` | `string \| null` | Profile picture URL |
| `createdAt` | `string` (ISO 8601) | Account creation time |
| `updatedAt` | `string` (ISO 8601) | Last profile update time |

### `Scenario`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique scenario identifier |
| `title` | `string` | Short display title |
| `description` | `string` | Markdown scenario description |
| `objective` | `string` | Goal shown to the user in the workspace |
| `difficulty` | `"beginner" \| "intermediate" \| "advanced"` | Difficulty rating |
| `commonality` | `"very_common" \| "common" \| "occasional" \| "rare"` | How often this situation occurs in practice |
| `estimatedTimeMinutes` | `number` | Suggested time to complete |
| `tags` | `string[]` | Topic tags (e.g. `["rebase", "conflict"]`) |
| `hints` | `string[]` | Ordered list of hints |
| `status` | `"draft" \| "testing" \| "published" \| "deprecated"` | Visibility state |
| `workspaceType` | `string` | Workspace image identifier |

### `Session`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique session ID |
| `userId` | `string` (UUID) | Owning user |
| `scenarioId` | `string` | Associated scenario |
| `status` | `"pending" \| "active" \| "submitted" \| "evaluated" \| "terminated"` | Lifecycle state |
| `startedAt` | `string` (ISO 8601) | Session start time |
| `wsUrl` | `string` | WebSocket URL for the terminal |
| `wsToken` | `string` | One-time token for WebSocket authentication |
| `expiresAt` | `string` (ISO 8601) | Hard expiry time (enforced by session monitor) |
| `hintCount` | `number` | Number of hints used so far |

### `Attempt`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Unique attempt ID |
| `sessionId` | `string` (UUID) | Source session |
| `userId` | `string` (UUID) | Owning user |
| `scenarioId` | `string` | Attempted scenario |
| `score` | `number` | Final score (0–100), adjusted for hints |
| `baseScore` | `number` | Raw score before hint penalty |
| `passed` | `boolean` | Whether all required checks passed |
| `assertions` | `AssertionResult[]` | Per-check results |
| `evaluatedAt` | `string` (ISO 8601) | Evaluation timestamp |

### `AssertionResult`

| Field | Type | Description |
|-------|------|-------------|
| `checkId` | `string` | Check identifier defined by the scenario |
| `passed` | `boolean` | Whether this check passed |
| `explanation` | `string` | Human-readable result message |
| `weight` | `number` | Contribution to total score (0–100) |
