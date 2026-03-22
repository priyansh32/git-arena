# Internet Test Setup (Host Dev + Tunnel)

Use this profile when you want to expose your host-dev stack to the internet for short-lived testing.

## 1) Prepare env

```bash
cp .env.example .env
# then set GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID to your test-project client
npm run env:lint
```

For your current setup:

- `GOOGLE_CLIENT_ID=344189929909-nlqu2jkcoi1dn6d5t4ia6q9d47f76cgg.apps.googleusercontent.com`
- `VITE_GOOGLE_CLIENT_ID=344189929909-nlqu2jkcoi1dn6d5t4ia6q9d47f76cgg.apps.googleusercontent.com`
- Optional invite-only test mode in backend:
  - `AUTH_TEST_MODE=true`
  - `AUTH_TEST_ALLOWED_EMAILS=you@example.com,teammate@example.com`

## 2) Start stack

```bash
./scripts/dev-up.sh all docker
```

## 3) Expose web port through your tunnel/proxy

Recommended path:

- Expose host `5173` publicly
- Keep API `3001` private
- Let Vite proxy `/api` and `/ws` internally

## 4) Google OAuth settings

In Google Cloud Console for the test OAuth client:

- Add your public test URL to **Authorized JavaScript origins**
  - example: `https://test.your-domain.example`

## 5) Optional hardening

- Set Cloudflare Access (or equivalent) in front of the test hostname.
- Stop tunnel when not actively testing.
