# ContainerYard — Logs Feature Implementation Prompt (Paste into Claude Code)

**Project root:** `/home/zk/projects/ContainerYard`  
**Goal:** Add first-class **Logs** functionality to ContainerYard with minimal risk, using our existing stack (Node/Express + React/Vite + TS + Tailwind + shadcn/ui). Keep security tight (session cookies & roles) and avoid exposing Docker sockets over the network.

---

## ✅ What you will build (deliverables)

1) **Per-container logs (Pi host)**
   - API `GET /api/hosts/:hostId/containers/:id/logs` with query params:
     - `follow` (bool) → Server-Sent Events (SSE) stream when true
     - `tail` (number, default 500; max 5000)
     - `since` (RFC3339 or seconds; optional)
     - `stdout` (0/1; default 1), `stderr` (0/1; default 1)
     - `timestamps` (0/1; default 0)
     - `grep` (string; optional, simple substring or JS regex literal `/pattern/i` parsed server-side with safe fallback)
   - **Host handling**
     - `hostId=piapps`: use Docker UNIX socket `/var/run/docker.sock` via `dockerode`
     - `hostId=synology`: **do not** access its Docker socket; instead return a small JSON with a **Dozzle URL** to open (we’ll render a button in the UI).

2) **Host file logs (read-only)**
   - API `GET /api/hostlogs/:name` (stream tail or SSE follow) reading only from a strict **allowlist**:
     - `nginx_containerYard_access` → `/var/log/nginx/container.piapps.dev.access.log`
     - `nginx_containerYard_error`  → `/var/log/nginx/container.piapps.dev.error.log`
     - `pm2_containeryard_out`      → `$HOME/.pm2/logs/containeryard-out.log`
     - `pm2_containeryard_err`      → `$HOME/.pm2/logs/containeryard-error.log`
     - `grafana_server`             → `/var/log/grafana/grafana.log` (if present)
     - `prometheus_server`          → `/var/log/prometheus/prometheus.log` or journalctl fallback
     - `cryptoagent_freqtrade`      → `~/bots/crypto-agent/user_data/logs/freqtrade.log` (if exists)
   - Query params: `follow`, `tail`, `since`, `grep`, `timestamps` (same semantics as above).
   - **No arbitrary path** access. Reject unknown names with 404.

3) **Client UI**
   - New **Logs** tab in **Container Details** page:
     - Controls: Tail size, Since, Stdout/Stderr toggles, Timestamps, Grep filter, **Follow** toggle.
     - When `hostId=synology`, show **“Open in Dozzle”** button (URL from API) and a short help text.
   - New **Host Logs** page (`/host-logs`):
     - Card list for each allowlisted log. Each card has a **View** action opening the live log viewer with the same controls.
   - Common **`<LogsViewer />`** component that can consume:
     - SSE streams (follow=true)
     - One-shot fetch (follow=false)
     - Client-side filter box (additional fast filter after server grep)
     - **Pause/Resume** and **Copy** last N lines
     - **Download** (server route below)

4) **Download endpoint (admin-only)**
   - `GET /api/logs/download?source=container|hostfile&hostId=..&id=..&name=..&tail=..&since=..`
   - Streams last N MB or last N lines (pick lines for simplicity) with `Content-Disposition: attachment`.
   - Enforce sane limits and role check.

5) **Security & Ops**
   - Use existing **session cookie** auth and **roles**: `viewer` can view; `admin` can download.
   - Rate limit log routes, return **text/event-stream** for SSE.
   - Never expose Docker socket over TCP; only UNIX socket on **Pi** machine.
   - Add basic **input validation** (zod or handcrafted): numeric bounds, regex parsing safe-guard, since parsing with fallback.
   - Add **CORS** and **cache** headers consistent with the rest of the API (no cache for SSE).

6) **(Optional, Phase 2) Loki**
   - Provide a `docker-compose.loki.yml` and promtail configs to ship PM2/Nginx/container logs to Loki, searchable in Grafana. Keep ContainerYard real-time tails as-is.

---

## 🧩 Code changes (high level)

> Adjust names/paths to match the current repo. The following assumes a common structure:
>
> - `server/` (Express app in TypeScript; built into `dist/index.js`)
> - `client/` (React/Vite TypeScript)
> - Env loaded via `dotenv/config`
> - PM2 runs `dist/index.js`

### Server

1. **Dependencies**
   ```bash
   cd server
   npm i dockerode event-stream
   npm i -D @types/dockerode
   ```

2. **Config: hosts map**
   - Add `config/hosts.ts`:
     ```ts
     export const HOSTS = {
       piapps: {
         type: 'docker',
         // docker unix socket on the Pi host
         socketPath: '/var/run/docker.sock',
       },
       synology: {
         type: 'dozzle',
         dozzleBase: 'https://synology.piapps.dev:9816', // adjust actual URL/port
       },
     } as const;
     export type HostId = keyof typeof HOSTS;
     ```

3. **Lib: docker client factory**
   - `lib/dockerClient.ts` to return a dockerode instance for `piapps` only.

4. **Routes: container logs**
   - `routes/containerLogs.ts`:
     - Validate params/query.
     - If `hostId=piapps`:
       - Use `dockerode.getContainer(id).logs({follow, stdout, stderr, tail, since, timestamps})`.
       - When `follow=true`, set headers for SSE and stream lines; otherwise return the last chunk.
       - If `grep` provided, filter server-side with a safe regex (try/catch; if invalid, treat as substring).
     - If `hostId=synology`:
       - Return `{ dozzleUrl: \`\${HOSTS.synology.dozzleBase}/containers/\${id}\` }` and **do not** attempt socket access.
   - Mount at `/api/hosts/:hostId/containers/:id/logs`.

5. **Routes: host file logs**
   - `routes/hostLogs.ts` with an allowlist map:
     ```ts
     const ALLOWLIST = {
       nginx_containerYard_access: '/var/log/nginx/container.piapps.dev.access.log',
       nginx_containerYard_error:  '/var/log/nginx/container.piapps.dev.error.log',
       pm2_containeryard_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
       pm2_containeryard_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
       grafana_server:             '/var/log/grafana/grafana.log',
       prometheus_server:          '/var/log/prometheus/prometheus.log',
       cryptoagent_freqtrade:      process.env.HOME + '/bots/crypto-agent/user_data/logs/freqtrade.log'
     } as const;
     ```
     - Verify file exists & readable; otherwise 404.
     - Implement tail reading (use `fs.createReadStream` offset seek or a small tail utility) and SSE follow using `fs.watch` + read append.
     - Apply `grep`/regex filter server-side (same as container logs).

6. **Route: download**
   - `routes/logDownload.ts`: admin-only; enforces limits; sets `Content-Type: text/plain` and `Content-Disposition` for attachment.

7. **Wiring**
   - Register routes in `server/index.ts` with auth + rate limits.
   - Add `/api/health` quick check for new modules (if not present).

### Client

1. **Add a Logs viewer component**
   - `client/src/components/LogsViewer.tsx` supporting both:
     - **SSE** (EventSource) for follow mode
     - **Fetch** for snapshot
   - Props:
     ```ts
     interface LogsViewerProps {
       endpoint: string;          // full API URL
       follow?: boolean;
       tail?: number;
       since?: string | number;
       stdout?: boolean;
       stderr?: boolean;
       timestamps?: boolean;
       grep?: string;
       title?: string;
       allowDownload?: boolean;
     }
     ```
   - Features:
     - Show latest N lines in a virtualized list.
     - UI controls for grep/tail/since/stdout/stderr/timestamps/follow.
     - Buttons: **Pause/Resume**, **Copy**, **Download** (if allowed).

2. **Container Details → Logs tab**
   - On container item page, add a tab that:
     - Calls `/api/hosts/:hostId/containers/:id/logs` with current controls.
     - When response has `{ dozzleUrl }`, render a card with an **“Open in Dozzle”** button instead of live tail.

3. **Host Logs page**
   - Simple grid of allowlisted sources with “Open” actions that route to a full-screen `<LogsViewer />` with proper endpoint.

4. **Styling**
   - Tailwind + shadcn/ui cards/buttons/inputs; keep our existing dark theme.
   - Use a monospaced font for the log body; auto-scroll when follow is on.

---

## 🔒 Security & Limits

- Auth: reuse existing session middleware; require `req.user.role` in {viewer, admin}.  
- Rate-limit: 10 req / 10s per IP for non-SSE routes; for SSE keep connection limits reasonable (2 per user).  
- Validation:
  - `tail`: 1–5000 (default 500)
  - `since`: parse ISO or number seconds; clamp to 7 days max look-back
  - `grep`: 0–200 chars; compile regex in try/catch; fallback to case-insensitive substring
- Deny path traversal and unknown allowlist names.
- Send `X-Content-Type-Options: nosniff`; set `Cache-Control: no-store` for SSE.

---

## 🧪 Acceptance tests (run locally on Pi)

> Start the app (`pm2 restart containeryard --update-env`) then:

### API sanity

```bash
# Pick an actual container id on the Pi (e.g., crypto-agent-freqtrade-trade-1)
CID=$(docker ps --format '{{.Names}}' | head -n1)

# Snapshot last 200 lines
curl -sS "http://127.0.0.1:5001/api/hosts/piapps/containers/$CID/logs?tail=200" | head

# Follow (press Ctrl+C after seeing lines)
curl -N "http://127.0.0.1:5001/api/hosts/piapps/containers/$CID/logs?follow=1&timestamps=1"

# Host file log snapshot
curl -sS "http://127.0.0.1:5001/api/hostlogs/nginx_containerYard_error?tail=100&grep=error" | tail
```

### UI
- Container → Logs tab shows live tail and controls.
- Synology containers show **Open in Dozzle** button.
- `/host-logs` lists allowlisted logs; each opens a live viewer.
- **Pause/Resume** works; **Copy** copies visible lines; **Download** available for admin only.

### Non-functional
- SSE stays connected for 10+ minutes.
- Rate limits kick in when spamming requests.
- Invalid `grep` doesn’t crash server; falls back to substring.

---

## 🛠 Notes & hints

- **dockerode** example for logs:
  ```ts
  const stream = await container.logs({
    follow, stdout, stderr, tail, since, timestamps
  });
  // demux if needed: Docker can multiplex stdout/stderr in a single stream
  ```
- For tailing files efficiently, consider a small helper that seeks from end and watches file growth. Keep memory bounded.
- Wrap all streams with `on('error')` handlers; ensure proper `res.flushHeaders()` for SSE.

---

## 📦 Optional Loki phase (separate PR)

- `docker-compose.loki.yml` with Loki + Promtail
- promtail scrape configs for:
  - `/var/log/nginx/*.log`
  - `$HOME/.pm2/logs/*.log`
  - Docker containers (`/var/lib/docker/containers/*/*-json.log`)
- Grafana data source provisioning and a basic “Logs Explorer” dashboard.
- ContainerYard left nav: add “Open Grafana Logs” outbound link.

---

## ✅ Definition of Done

- All routes implemented with tests above passing.
- UI works on desktop and mobile, follows our theme.
- No open file descriptors after client disconnect (SSE cleanup).
- Role checks in place; log downloads admin-only.
- No network exposure of Docker socket.
- PR includes brief `HARDENING_SUMMARY.md` section about the new endpoints.

---

Please implement now. If something is unclear, assume sensible defaults and proceed — we’ll iterate after first pass.
