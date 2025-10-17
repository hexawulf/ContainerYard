# Codex Handoff — ContainerYard Monitoring & Auth Upgrade

This handoff packages the remaining work needed for Codex to deliver production-ready multi-host monitoring with role-based access control for ContainerYard.org. All technical background, including Docker network topology, is grounded in `container-inventory-piapps-synology.md` — treat that document as the source of truth for runtime IPs, networks, and service ports.

---

## 1. Environment & Deployment Targets

- **Repo root**: `/home/zk/projects/ContainerYard`
- **Frontend**: `client/` (React + Vite)
- **Backend**: `server/` (Node 18, Express, TypeScript)
- **Production entry**: `pm2` process behind Nginx, exposed at `https://containeryard.org` on `PORT=5001`

Ensure `.env` (or deployment secrets) define:

```env
PORT=5001
NODE_ENV=production
LOG_LEVEL=info
PROVIDER=DOCKER
DOCKER_HOST=unix:///var/run/docker.sock
SYNOLOGY_CADVISOR_URL=http://192.168.50.147:9818
SYNOLOGY_DOZZLE_URL=http://192.168.50.147:9816
SESSION_SECRET=<long random>
COOKIE_NAME=cy.sid
COOKIE_DOMAIN=containeryard.org
ALLOWED_ORIGIN=https://containeryard.org
REDIS_URL=redis://127.0.0.1:6379
ADMIN_EMAIL=admin@containeryard.org
ADMIN_PASSWORD=<strong bootstrap secret>
```

---

## 2. Docker Network Topology (Reference)

Use the inventory doc for validation and regression tests:

| Host | Compose/Stack | Primary Network(s) | Notable Containers | IP / Ports |
|------|---------------|--------------------|--------------------|------------|
| **piapps** (`~/bots/crypto-agent`) | `crypto-agent` | `crypto-agent_crypto_net`, `crypto-agent_default` | `prometheus`, `grafana`, `freqtrade`, `freqtrade-exporter`, `cadvisor` | `prometheus:9090`, `grafana:3000`, `freqtrade-exporter:9091`, `cadvisor:8080` → Prom scrape |
| **Synology NAS** (`/volume1/docker/media-stack`) | `media-stack` | `mangrove_dockernet` (static IPs) | `tautulli`, `sabnzbd`, `radarr`, `sonarr`, `bazarr`, `prowlarr`, `dozzle`, `watchtower`, `plex`, `cadvisor` | `cadvisor:172.18.0.18 → 9818/tcp`, Dozzle proxy `9816/tcp` |

Prometheus (on piapps) already scrapes `cadvisor:8080` locally and `http://192.168.50.147:9818/metrics` (Synology). Preserve these node labels: `node=piapps`, `node=synology`.

---

## 3. Backend Scope

1. **AuthN/Z**
   - Add persistence (Drizzle/Prisma) for `User { id, email, password(bcrypt>=12), role[ADMIN|VIEWER], totpSecret? }`.
   - Seed the first admin from `ADMIN_EMAIL/ADMIN_PASSWORD` when the table is empty.
   - Integrate `express-session` with Redis store; cookies: Secure, HttpOnly, SameSite=Lax.
   - Routes:
     - `POST /api/auth/login` — validate credentials, rotate session.
     - `POST /api/auth/logout`.
     - `GET /api/auth/me`.
     - `GET /api/auth/csrf` (for double-submit token).
     - Optional: `/api/auth/2fa/*` (TOTP) if bandwidth allows.
   - Middleware: `requireAuth`, `requireRole('ADMIN')`, rate limiting (global and stricter on login), CSRF, Helmet, CORS locked to `ALLOWED_ORIGIN`.

2. **Monitoring APIs** (all behind `requireAuth`):
   - `GET /api/hosts` → returns host metadata with network labels.
   - `GET /api/hosts/:hostId/containers` → normalized list with `node`, `networks`, `ports`.
   - `GET /api/hosts/:hostId/containers/:cid` → container detail.
   - `GET /api/hosts/:hostId/containers/:cid/stats` → live CPU/MEM/IO. For Synology, derive from cAdvisor metrics (`/api/v1.3/subcontainers` or `/metrics`).
   - `GET /api/hosts/:hostId/containers/:cid/logs` (piapps only). For Synology, return Dozzle link `SYNOLOGY_DOZZLE_URL` instead.
   - Optional `/metrics` (Prometheus) for ContainerYard process itself via `prom-client`.

3. **Host configuration**
   - Centralize in `server/src/config/hosts.ts` using the topology values above.
   - `piapps` uses Docker socket (`/var/run/docker.sock`).
   - `synology` uses `SYNOLOGY_CADVISOR_URL` + optional Dozzle.

---

## 4. Frontend Scope

1. **Authentication UX**
   - `/login` route with form + CSRF handling.
   - Fetch `/api/auth/me` on app load; gate protected routes.
   - Display role badge (Admin/Viewer) and logout control.

2. **Monitoring UI**
   - Host switcher persists between sessions.
   - Tables show container name, status, ports, **network** (from topology) and node label.
   - Poll `/stats` every ~2s for visible containers; show CPU/Mem graphs or badges.
   - For Synology entries, expose “Open in Dozzle” linking to `SYNOLOGY_DOZZLE_URL`.

3. **Error + Loading States**
   - Handle auth failures (401) with redirect to `/login`.
   - Surfaced rate-limit messages for login attempts.

---

## 5. Security Checklist

- Enforce HTTPS-only cookies via Nginx (HSTS ≥ 6 months).
- No external exposure of Docker socket; keep interactions local to piapps host user (in `docker` group).
- Login brute-force: limit to ≤10 attempts / 15 min per IP.
- CSRF token validation on future write routes; include double-submit cookie setup now.
- Sanitize user input with schema validation (`zod` or equivalent) on all auth endpoints.

---

## 6. Verification

1. **Auth**
   ```bash
   curl -i -X POST https://containeryard.org/api/auth/login \
     -H 'Content-Type: application/json' \
     --data '{"email":"admin@containeryard.org","password":"<ADMIN_PASSWORD>"}'

   curl -b 'cy.sid=<cookie>' https://containeryard.org/api/auth/me
   curl -b 'cy.sid=<cookie>' -X POST https://containeryard.org/api/auth/logout -i
   ```

2. **Protected APIs**
   ```bash
   curl -i https://containeryard.org/api/hosts                # expect 401
   curl -b 'cy.sid=<cookie>' https://containeryard.org/api/hosts | jq
   curl -b 'cy.sid=<cookie>' https://containeryard.org/api/hosts/piapps/containers | jq
   curl -b 'cy.sid=<cookie>' https://containeryard.org/api/hosts/synology/containers | jq
   ```

3. **Topology Validation**
   - Confirm returned container metadata reflects network bindings from `container-inventory-piapps-synology.md` (e.g., cadvisor on `mangrove_dockernet` @ `172.18.0.18`, Prometheus on `crypto-agent_crypto_net`).
   - Grafana dashboards should allow switching between `node=piapps` and `node=synology` without data gaps.

4. **Frontend**
   - Login flow protects all app routes; unauthorized visitors are redirected.
   - Container tables display node/network information and live stats.
   - Synology containers render Dozzle link using `SYNOLOGY_DOZZLE_URL`.

---

## 7. Deployment Runbook

```bash
cd /home/zk/projects/ContainerYard
npm install                 # ensure new deps resolved
npm run build               # type-check + compile
pm2 restart containeryard
pm2 logs containeryard --lines 80
```

Monitor Prometheus targets (`/api/v1/targets`) to verify both `piapps` and `synology` remain healthy post-deploy.
