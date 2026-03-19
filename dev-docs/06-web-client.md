# 06 - Web Client Deep Dive

Frontend lives in `apps/web` and is built with React + Vite.

## App Shell and Routing

`src/App.tsx` defines top-level routes:

- `/dashboard`
- `/history`
- `/scenarios/:id`
- `/sessions/:id`
- `/sessions/:id/result`

Unknown paths redirect to `/dashboard`.

Auth gate:

- app bootstraps user via `GET /api/v1/users/me`
- unauthenticated users see `LoginPage` with Google Sign-In button
- authenticated users get full app shell + routes

## API Integration Pattern

`src/api/client.ts`:

- wraps `fetch` for each endpoint
- centralizes JSON parsing and typed error throwing (`ApiError`)
- all endpoints use `/api/v1` base
- requests send `credentials: "include"` for cookie session auth

Route pages call these functions inside `useEffect` or button handlers.

## Page Responsibilities

Login (`LoginPage.tsx`):

- loads Google Identity Services script and renders Google sign-in button
- calls backend auth exchange (`POST /api/v1/auth/google`)

Dashboard (`DashboardPage.tsx`):

- fetches scenarios + current active session
- displays scenario cards
- resume CTA for active session

Scenario detail (`ScenarioDetailPage.tsx`):

- fetches scenario + scenario-specific attempt list
- launches session
- handles `409` conflict by redirecting to existing active session

Workspace (`SessionWorkspacePage.tsx`):

- fetches session + scenario
- shows objective, hint/submit/quit actions
- mounts terminal component when session status is active/submitted

Result (`SessionResultPage.tsx`):

- fetches attempt + session result
- renders score breakdown and assertion list

History (`HistoryPage.tsx`):

- fetches user attempts + scenario map
- renders attempt timeline with links

## Terminal Component

`src/components/SessionTerminal.tsx`:

- creates `Terminal` from xterm
- uses `FitAddon` for sizing
- opens websocket to `ws(s)://<host>/ws/sessions/:id?token=...`
- forwards xterm `onData` input to socket
- writes incoming socket output to terminal
- displays connection state banner

The component sends raw keystrokes and handles both string and `ArrayBuffer` payloads.
Browser auth cookie is automatically included in websocket handshake.

## Styling System

Main style file: `src/index.css`

- CSS custom properties in `:root` define color tokens.
- Layout primitives: `.stack`, `.grid`, `.workspace-grid`.
- Shared UI pieces: `.button`, `.detail-card`, `.score-pill`, `.badge`.
- Terminal-specific blocks: `.terminal-shell`, `.terminal-canvas`, `.terminal-status`.

No CSS framework is used; styling is handcrafted and repo-local.

## Dev Server vs Docker Runtime

Vite dev mode:

- `vite.config.ts` proxies `/api` to `http://localhost:3001`
- websocket path `/ws` reaches API directly in local setup

Docker runtime:

- Nginx serves static web bundle
- `apps/web/nginx.conf` proxies:
  - `/api/` -> `api:3001`
  - `/ws/` -> `api:3001` with websocket upgrade headers

## UI Change Workflow

1. Update page/component TSX.
2. Update shared styles in `index.css` if needed.
3. Validate desktop + mobile breakpoints.
4. Verify terminal still focuses and input reaches backend after UI changes.
