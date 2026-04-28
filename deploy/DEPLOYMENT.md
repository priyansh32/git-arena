# Deployment Guide

## Architecture

- **API + DB**: Hetzner server (this repo, Docker Compose)
- **Web frontend**: Vercel (separate deployment)
- **Domain**: `api.git-arena.hellopriyansh.xyz` → this server

### Services (docker-compose)
| Service | Role |
|---|---|
| `postgres` | Database (internal only) |
| `api` | Fastify API server on port 3001 (internal only) |
| `nginx` | Reverse proxy, terminates TLS on 80/443 |
| `socket-proxy` | Docker socket proxy (limits API's Docker access) |
| `certbot` | Used for cert renewal (run via cron) |

---

## First-time Setup

### 1. Firewall
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2. Environment variables
Copy `.env.example` to `.env` and fill in:
```bash
cp .env.example .env
```

Generate secrets:
```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
```

Set the remaining values in `.env`:
```
GOOGLE_CLIENT_ID=          # from Google Cloud Console
VITE_GOOGLE_CLIENT_ID=     # same value
CORS_ORIGINS=https://git-arena.hellopriyansh.xyz
```

### 3. Point DNS
Add an **A record** in your DNS provider:
```
api.git-arena.hellopriyansh.xyz → <server-ip>
```

### 4. Get SSL certificate
Make sure all containers are stopped and port 80 is free, then:
```bash
docker run --rm \
  -p 80:80 \
  -v /root/git-arena/certbot/conf:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  --email your@email.com \
  --agree-tos --no-eff-email \
  -d api.git-arena.hellopriyansh.xyz
```

Download nginx TLS params (required once):
```bash
curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
  -o /root/git-arena/certbot/conf/options-ssl-nginx.conf

curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
  -o /root/git-arena/certbot/conf/ssl-dhparams.pem
```

### 5. Build workspace image
```bash
docker build -t gitarena-base:v2 -f apps/workspace/Dockerfile apps/workspace/
```

### 6. Start everything
```bash
docker compose up -d --build
```

### 7. Set up cert renewal (cron)
```bash
(crontab -l 2>/dev/null; echo "0 3 * * * cd /root/git-arena && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload") | crontab -
```

### 8. Run database migrations
```bash
docker compose exec api node apps/api/dist/migrate.js
# or however migrations are run in this project
```

---

## Updating

```bash
git pull
docker compose up -d --build
```

If the workspace image changed:
```bash
docker build -t gitarena-base:v2 -f apps/workspace/Dockerfile apps/workspace/
```

---

## Vercel (Frontend)

Set these environment variables in the Vercel project settings:
```
VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
VITE_API_BASE_URL=https://api.git-arena.hellopriyansh.xyz/api/v1
VITE_WS_BASE_URL=wss://api.git-arena.hellopriyansh.xyz
```

---

## Useful Commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f nginx

# Health check
curl https://api.git-arena.hellopriyansh.xyz/api/v1/health

# Restart a service
docker compose restart api

# Check cert expiry
openssl x509 -in certbot/conf/live/api.git-arena.hellopriyansh.xyz/fullchain.pem -noout -dates

# Manual cert renewal
docker compose run --rm certbot renew --quiet
docker compose exec nginx nginx -s reload
```

---

## Security Notes

- Postgres is not exposed to the host (internal Docker network only)
- API container runs as non-root (`apiuser`, UID 1001)
- Docker socket is proxied via `tecnativa/docker-socket-proxy` (containers/exec only)
- Rate limiting: 120 req/min global, 10 req/min on auth, 20 req/min on session create
- Sessions use HMAC-SHA256 signed tokens (`SESSION_SECRET`)
- HSTS enabled via nginx (`max-age=31536000`)
