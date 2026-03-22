# Internet Test Setup (Compose Test Stack + Tunnel)

Use this profile when you want to expose the compose-based test stack to the internet for short-lived testing.

## 1) Prepare env

```bash
cp .env.example .env
# then set GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID to your test-project client
npm run env:lint
```

For your current setup:

- `GOOGLE_CLIENT_ID=344189929909-nlqu2jkcoi1dn6d5t4ia6q9d47f76cgg.apps.googleusercontent.com`
- `VITE_GOOGLE_CLIENT_ID=344189929909-nlqu2jkcoi1dn6d5t4ia6q9d47f76cgg.apps.googleusercontent.com`
- `VITE_ALLOWED_HOSTS=ga-8c2ebc01.hellopriyansh.xyz`
- Optional invite-only test mode in backend:
  - `AUTH_TEST_MODE=true`
  - `AUTH_TEST_ALLOWED_EMAILS=you@example.com,teammate@example.com`

## 2) Start stack

```bash
npm run test:up
```

## 3) Expose web port through your tunnel/proxy

Recommended path:

- Expose host `5173` publicly
- Keep API `3001` private
- Defaults come from `.env`:
  - `TEST_WEB_PORT=5173` (public through tunnel)
  - `TEST_API_PORT=3001` (private/local only)
- Frontend calls `/api` and `/ws` same-origin; Vite preview proxies to internal `api:3001`.

## 4) Google OAuth settings

In Google Cloud Console for the test OAuth client:

- Add your public test URL to **Authorized JavaScript origins**
  - example: `https://test.your-domain.example`

## 5) Optional hardening

- Set Cloudflare Access (or equivalent) in front of the test hostname.
- Stop tunnel when not actively testing.
