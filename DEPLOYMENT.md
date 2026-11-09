# ContainerYard Deployment Guide

This guide covers deploying ContainerYard in production with **Docker Compose** (recommended, v4.0+) as well as legacy bare-metal **PM2** deployments.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Run with Docker Compose (Recommended)](#run-with-docker-compose-recommended)
  - [Prerequisites](#prerequisites)
  - [Quick Start (3 Commands)](#quick-start-3-commands)
  - [Host Logs Overlay (Nginx & PM2 Logs)](#host-logs-overlay-nginx--pm2-logs)
  - [Upgrading](#upgrading)
  - [Backup & Restore](#backup--restore)
- [Reverse Proxy (Nginx + TLS)](#reverse-proxy-nginx--tls)
- [Docker Socket Security](#docker-socket-security)
- [Remote Hosts (cAdvisor & Dozzle)](#remote-hosts-cadvisor--dozzle)
- [Environment Reference](#environment-reference)
- [Migrating from PM2 to Docker (Phase C Cutover)](#migrating-from-pm2-to-docker-phase-c-cutover)
- [Legacy Deployment: PM2 on Bare Metal](#legacy-deployment-pm2-on-bare-metal)

---

## Architecture Overview

```text
Internet / LAN
      │  HTTPS (TLS termination)
      ▼
┌───────────────────────────────────────────────────────────┐
│ Nginx Reverse Proxy (host)                                │
│   proxy_pass http://127.0.0.1:5008                        │
│   X-Forwarded-Proto: https                                │
└───────────────────────────┬───────────────────────────────┘
                            │ 127.0.0.1:5008
                            ▼
┌───────────────────────────────────────────────────────────┐
│ Docker Compose network (cy-internal)                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ app (0xwulf/containeryard:4.0.0)                    │  │
│  │  • uid 1000 (node), tini PID 1, read-only rootfs    │  │
│  │  •cy-data:/data (SQLite app.db)                     │  │
│  │  • /var/run/docker.sock (local Docker API)          │  │
│  │  • /host/nginx:ro, /host/pm2:ro (optional logs)     │  │
│  └──────────────┬──────────────────────────┬───────────┘  │
│                 │                          │              │
│                 ▼                          ▼              │
│  ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │ redis (redis:7-alpine)   │   │ Remote Hosts (HTTP)  │  │
│  │  • cy-redis:/data (AOF)  │   │  • edge-01 cAdvisor  │  │
│  │  • internal-only         │   │  • nas-01 cAdvisor   │  │
│  │                          │   │  • optional Dozzle   │  │
│  └──────────────────────────┘   └──────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## Run with Docker Compose (Recommended)

Published multi-arch images (`linux/amd64` and `linux/arm64`) are available on Docker Hub at [`0xwulf/containeryard`](https://hub.docker.com/r/0xwulf/containeryard).

### Prerequisites
- **Docker Engine** 24+ and **Docker Compose** v2+
- A **TLS reverse proxy** (e.g. Nginx, Caddy, Traefik) forwarding `X-Forwarded-Proto: https` to `127.0.0.1:5008`. Session cookies are always `Secure`, so login requires HTTPS termination.
- Know your host's `docker` group GID (`getent group docker | cut -d: -f3`, usually `113` or `999`) so the non-root container user (`uid 1000`) can access `/var/run/docker.sock`.

### Quick Start (3 Commands)

```bash
cp .env.example .env && nano .env     # Set SESSION_SECRET, REDIS_PASSWORD, ADMIN_*, ALLOWED_ORIGINS, CADVISOR_URLs
docker compose pull
docker compose up -d
```

On first boot, `docker/entrypoint.sh` automatically:
1. Verifies all required environment variables (without echoing secrets).
2. Creates `/data` and runs `prisma db push --skip-generate` to initialize or migrate the SQLite database (`/data/app.db`).
3. Runs `server/prisma/seed.js` to create the initial `ADMIN` account from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (no-op if any user already exists).
4. Starts the Express + React server on port `5008`.

Verify health:
```bash
curl -fsS http://127.0.0.1:5008/health
# {"ok":true,"uptime":12.34,"ts":...}
```

### Host Logs Overlay (Nginx & PM2 Logs)

To expose host-level Nginx and PM2 logs on the ADMIN **Host Logs** page while keeping the container isolated, merge the `deploy/hostlogs/docker-compose.hostlogs.yml` override file:

```bash
docker compose -f docker-compose.yml -f deploy/hostlogs/docker-compose.hostlogs.yml up -d
```

This bind-mounts `/var/log/nginx` to `/host/nginx:ro` and `~/.pm2/logs` to `/host/pm2:ro`, and sets `HOSTLOG_NGINX_DIR=/host/nginx` and `PM2_LOG_DIR=/host/pm2`. Ensure `ADM_GID` (default `4` on Debian/Ubuntu) matches the group owner of `/var/log/nginx/*.log`.

### Upgrading

Use `scripts/docker-deploy.sh` to pull a new version, back up the `cy-data` SQLite database volume, recreate the container, and verify `/health`:

```bash
scripts/docker-deploy.sh 4.0.0 --dry-run   # preview actions
scripts/docker-deploy.sh 4.0.0             # deploy and verify
```

### Backup & Restore

**Volumes:**
- `cy-data` (`/data/app.db`): SQLite database containing users, password hashes, `sessionVersion`, audit logs, log bookmarks, and saved searches.
- `cy-redis` (`/data`): Redis AOF persistence for active login sessions.

**Backup SQLite database:**
```bash
mkdir -p ~/backups/containeryard
docker run --rm \
  -v containeryard_cy-data:/data:ro \
  -v "$HOME/backups/containeryard:/backup" \
  --entrypoint /bin/cp \
  0xwulf/containeryard:latest -a /data/app.db "/backup/app.db.bak-$(date +%Y%m%d-%H%M%S)"
```

**Restore SQLite database:**
```bash
docker compose stop app
docker run --rm \
  -v containeryard_cy-data:/data \
  -v "$HOME/backups/containeryard:/backup:ro" \
  --entrypoint /bin/sh \
  0xwulf/containeryard:latest -c "cp -a /backup/app.db.bak-YYYYMMDD-HHMMSS /data/app.db && chown 1000:1000 /data/app.db"
docker compose start app
```

---

## Reverse Proxy (Nginx + TLS)

ContainerYard binds to `127.0.0.1:5008` by default (`CY_BIND=127.0.0.1`, `CY_PORT=5008`), relies on `app.set("trust proxy", 1)`, and sets `Secure` session cookies. Your reverse proxy **must** terminate TLS and forward `X-Forwarded-Proto https`:

```nginx
server {
    listen 443 ssl http2;
    server_name containeryard.example.com;

    ssl_certificate     /etc/letsencrypt/live/containeryard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/containeryard.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5008;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE live log streaming and WebSocket terminal
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

---

## Docker Socket Security

ContainerYard accesses the local Docker daemon via `/var/run/docker.sock`.
- **Root equivalence:** Mounting `/var/run/docker.sock` grants effective root privileges on the host. ContainerYard mitigates container escape surface by running as non-root (`uid 1000`), dropping all Linux capabilities (`cap_drop: [ALL]`), enabling `no-new-privileges:true`, mounting the root filesystem read-only (`read_only: true`), and binding only to `127.0.0.1:5008`.
- **Never expose Docker over unauthenticated TCP (`tcp://0.0.0.0:2375`).** To monitor remote hosts (`edge-01`, `nas-01`), run **cAdvisor** (and optionally **Dozzle**) on those hosts and configure `CY_REMOTE_HOSTS`.
- **Watchtower opt-out:** Both `app` and `redis` services carry `com.centurylinklabs.watchtower.enable=false` so Watchtower does not restart them unannounced.

---

## Remote Hosts (cAdvisor & Dozzle)

Remote hosts configured in `CY_REMOTE_HOSTS` (parsed by `server/src/config/env.ts` and `server/src/config/hosts.ts`) use the `CADVISOR_ONLY` provider:
- `CY_REMOTE_HOSTS` is a JSON array of objects: `[{"id":"edge-01","name":"Edge 01","cadvisorUrl":"http://cadvisor.example.internal:8080","dozzleUrl":"https://dozzle.example.internal"}]`.
- ContainerYard queries each remote host's `cadvisorUrl` for container lists and real-time CPU/memory/network telemetry.
- Lifecycle actions (start/stop/restart) are disabled on `CADVISOR_ONLY` hosts (`501`).
- If `dozzleUrl` is set on a remote host entry, ContainerYard links out to Dozzle for remote container logs (`<dozzleUrl>/container/<short id>`).

---

## Environment Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SESSION_SECRET` | **Yes** | — | Session signing secret (`>= 32` chars, e.g. `openssl rand -hex 32`) |
| `REDIS_PASSWORD` | **Yes** (Compose) | — | Password for the bundled Redis container (`openssl rand -hex 24`) |
| `REDIS_URL` | **Yes** | `redis://:${REDIS_PASSWORD}@redis:6379/0` | Redis connection URL (set automatically in `docker-compose.yml`) |
| `ALLOWED_ORIGINS` | **Yes** | — | Comma-separated CORS origins (e.g. `https://containeryard.org`) |
| `DATABASE_URL` | **Yes** | `file:/data/app.db` | Prisma database URL (`file:/data/app.db` in Compose, or `postgresql://...`) |
| `ADMIN_EMAIL` | **Yes** | — | Bootstrap ADMIN email (used when `User` table is empty) |
| `ADMIN_PASSWORD` | **Yes** | — | Bootstrap ADMIN password (`>= 12` chars) |
| `CY_LOCAL_HOST_ID` | No | `local` | Local Docker host ID (`/^[a-z0-9-]{1,32}$/`) |
| `CY_LOCAL_HOST_NAME` | No | `Local Docker` | Display name for the local Docker host |
| `CY_REMOTE_HOSTS` | No | `[]` | JSON array of `{id, name, cadvisorUrl, dozzleUrl?}` for remote cAdvisor hosts |
| `PORT` | No | `5008` | HTTP server listen port inside the container |
| `NODE_ENV` | No | `production` | Runtime environment (`development`, `test`, `production`) |
| `LOG_LEVEL` | No | `info` | Server log verbosity |
| `DOCKER_HOST` | No | `unix:///var/run/docker.sock` | Local Docker socket path |
| `COOKIE_NAME` | No | `__Secure-cy.sid` | Session cookie name |
| `COOKIE_DOMAIN` | No | unset | Optional session cookie domain |
| `COOKIE_SAMESITE` | No | `none` | Cookie SameSite policy (`lax` recommended when UI & API share origin) |
| `METRICS_TOKEN` | No | unset | Optional bearer token for `GET /metrics` |
| `PUBLIC_API_BASE` | No | request origin | Optional override returned by `/api/runtime-config` |
| `WEBHOOK_ALLOW_PRIVATE` | No | `false` | Allow alert webhooks to private/LAN IPs |
| `WEBHOOK_ALLOWED_HOSTS` | No | empty | Comma-separated webhook hostnames exempt from private IP block |
| `AUDIT_RETENTION_DAYS` | No | `180` | Days to retain `AuditLog` entries |
| `HOSTLOGS_LOCAL_HOST` | No | `CY_LOCAL_HOST_ID` | Host ID that serves local host logs |
| `HOSTLOG_NGINX_DIR` | No | `/var/log/nginx` | Directory containing nginx access/error logs |
| `HOSTLOG_NGINX_ACCESS_FILE` | No | `access.log` | Nginx access log filename inside `HOSTLOG_NGINX_DIR` |
| `HOSTLOG_NGINX_ERROR_FILE` | No | `error.log` | Nginx error log filename inside `HOSTLOG_NGINX_DIR` |
| `PM2_LOG_DIR` | No | `~/.pm2/logs` | Directory containing PM2 log files |
| `PM2_APP_NAME` | No | `containeryard-api` | PM2 process name prefix for log resolution |
| `CY_SKIP_DB_PUSH` | No | `0` | Set to `1` to skip `prisma db push` and `seed.js` in `entrypoint.sh` |
| `CY_TAG` | No | `latest` | Docker image tag used by `docker-compose.yml` |
| `CY_BIND` | No | `127.0.0.1` | Host IP bound by `docker-compose.yml` |
| `CY_PORT` | No | `5008` | Host port bound by `docker-compose.yml` |
| `DOCKER_GID` | No | `113` | Host `docker` group GID passed to `group_add` |
| `ADM_GID` | No | `4` | Host `adm` group GID passed to `group_add` for reading `/var/log/nginx` |

---

## Migrating from PM2 to Docker (Phase C Cutover)

If you are currently running ContainerYard under PM2 on `:5008`:

1. Ensure `REDIS_PASSWORD` is set in `.env` (`openssl rand -hex 24`).
2. Back up `server/prisma/app.db` and `.env`, stop `pm2 containeryard-api`, copy `app.db` into the `containeryard_cy-data` Docker volume, and start the Compose stack with `scripts/docker-deploy.sh 5.0.0`.
3. Once verified, remove the legacy PM2 process:
   ```bash
   pm2 delete containeryard-api && pm2 save
   ```

---

## Legacy Deployment: PM2 on Bare Metal

For bare-metal deployments without Docker Compose:

```bash
npm ci
cp .env.example .env && nano .env
npm run db:push:prisma
node server/prisma/seed.js
npm run build
pm2 startOrReload ecosystem.config.cjs && pm2 save
```

The legacy helper `scripts/deploy-static.sh [--dry-run]` remains available for PM2 updates.
