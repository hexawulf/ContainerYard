# Project: ContainerYard → Dozzle++ (Planning Mode Only)
# Repo: /home/zk/projects/ContainerYard
# Targets (frontends):
# - container.piapps.dev  (Nginx → 127.0.0.1:5008, current)
# - containeryard.org     (legacy route; keep in mind during migration)

## Goal
Design a plan to evolve ContainerYard from “basic host specs + logs” into a **Dozzle-class container log/inspect dashboard** with extra features (multi-host, search, filters, stats, RBAC, downloads, Prometheus/Loki integration). Produce a precise, actionable plan we can hand to an executor model (DeepSeek) for implementation.

## Hard Constraints
- **Security first**
  - Use existing **session-cookie auth** and **roles** (viewer/admin). No anonymous access.
  - Do **NOT** expose the Docker socket over TCP. Use local UNIX socket only on the Pi host.
  - **No arbitrary file paths** for host logs; strict allowlist only.
  - Keep CSRF/rate-limits aligned with the current backend defaults.
- **Infra reality**
  - Nginx proxies ContainerYard (currently at 127.0.0.1:5008).
  - Prometheus & Grafana exist; cAdvisor runs for host/container stats (localhost & Synology).
- **Tech stack**
  - Node/Express + React/Vite + TypeScript + Tailwind + shadcn/ui.
  - Redis for sessions; Postgres may be present.
- **File system conventions**
  - Host log roots are under **/home/zk/logs** on Pi. Use absolute paths only in code and docs.

## Repository Reconnaissance (what to read first)
- Root: package manager files, scripts, PM2 config (`ecosystem.*`), `.env*`, `vite.config.ts`, `tsconfig.json`.
- **Server**: entry (`server/index.ts`), route modules (`server/routes/**`), Docker client usage (dockerode or similar), auth/session middleware, rate-limits, health checks.
- **Client**: routing, container list/detail pages, any existing `<LogsViewer />` or terminal/xterm components; state management (TanStack Query?).
- Logging feature drafts (server+client) and any “host logs” allowlist implementation.
- Nginx vhost notes (ports/domains) as reference only.

## Current State You Must Extract & Summarize
Produce a compact “Current State” report with file/line anchors:
1. **Endpoints & Auth**: list all backend routes, auth guards, cookie flags, session store, CSRF, rate limits.
2. **Logs (today)**: what exists for container logs and host file logs (routes, params, SSE vs snapshot, filtering, limits).
3. **Container discovery**: how containers are listed (dockerode? cached? labels?), any multi-host hooks.
4. **Metrics**: where Prometheus/cAdvisor data is available; any app metrics endpoints.
5. **Client UX**: pages, components, state mgmt (TanStack Query?), existing tabs for container details.

## Dozzle++ Feature Plan (Design first, no code yet)
### A) Multi-host model
- **Hosts map:**
  - `piapps`: local UNIX `/var/run/docker.sock` (dockerode access via Node).
  - `synology`: **no socket**; for logs, return a prebuilt “Open in Dozzle” URL to the existing Dozzle on Synology.
- UI Host Switcher (dropdown). Persist last host in session/localStorage.

### B) Container list & details
- List with **search**, **status filters**, **labels filter**, **sorting** (name, status, CPU, mem).
- **Details tabs:** Overview | **Logs** | Inspect (JSON) | Stats.
- “Pin/Bookmark” containers (store minimal metadata in local DB or localStorage; propose schema).

### C) Logs (Dozzle-class)
- API: `GET /api/hosts/:hostId/containers/:id/logs`
  - Query params: `follow, tail, since, stdout, stderr, timestamps, grep`
  - **SSE** for follow; snapshot for non-follow requests.
  - **Grep**: safe regex with fallback to case-insensitive substring; guard length and look-back windows.
  - Limits: tail 1–5000; since ≤ 7d; connection limits per user.
- UI `<LogsViewer/>`:
  - Virtualized list, **Follow/Pause**, **Copy**, **Download** (admin only), inline grep, timestamps toggle.
  - If host = `synology`, show **“Open in Dozzle”** (URL from API) instead of live tail.

### D) Host file logs (allowlist)
- API: `GET /api/hostlogs/:name` with mirrored controls (`follow, tail, since, grep, timestamps`).
- Strict allowlist (e.g., `nginx`, `pm2`, `grafana`, `prometheus`, `freqtrade`, `pideck`), each mapped to **absolute** paths under `/home/zk/logs`.
- UI page **/host-logs**: grid of known logs → each opens the viewer.

### E) Stats
- For `piapps`: surface CPU/Mem/Net from **docker stats** or from **cAdvisor** (decide one source of truth per metric).
- For `synology`: show minimal status plus link to Dozzle; consider remote stats in Phase 2.

### F) Downloads (admin only)
- `GET /api/logs/download` to stream last N lines; set `Content-Disposition`. Enforce role & bounds.

### G) Security & Ops
- Reuse session middleware; verify cookie flags (`httpOnly`, `secure`, `sameSite`).
- Input validation (zod or handcrafted).
- Rate-limits for non-SSE, per-IP & per-session; 429 responses tested.
- Headers: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` for SSE responses.
- No TCP Docker socket; only local UNIX. No arbitrary file reads.

### H) Optional Phase 2
- **Loki/Promtail** sidecar compose; searchable logs in Grafana while keeping real-time tails in-app.
- Saved views (persist grep/tail presets per container), and alert presets on grep patterns.

## Acceptance Checklist (the executor must satisfy)
**API sanity**
- Snapshot logs, SSE follow, grep, timestamps, tail bounds, since bounds, per-container & host logs.
- Synology path returns Dozzle URL (no socket access attempted).

**Client UX**
- Container details → Logs tab works (follow/pause/download/copy).
- Host logs page lists allowlisted sources; opens viewer with controls.
- Multi-host switcher persists user choice.

**Non-functional**
- SSE stability for sustained tails (≥ 10 min).
- Rate-limit triggers are observable/testable.
- Invalid regex falls back safely; no server crash.
- Admin-only download enforced everywhere.

**Security**
- No TCP docker socket; only local UNIX.
- No arbitrary file reads; allowlist-only host logs.

## API Spec v1 (first draft)
### Containers
- `GET /api/hosts` → list known hosts and capabilities.
- `GET /api/hosts/:hostId/containers` → list containers (status, image, labels, startedAt, CPU%, Mem%).
- `GET /api/hosts/:hostId/containers/:id` → container info + inspect JSON.
- `GET /api/hosts/:hostId/containers/:id/stats` → live stats (SSE or polling JSON).
- `GET /api/hosts/:hostId/containers/:id/logs[?follow&tail=1000&since=3600&stdout=1&stderr=0&timestamps=0&grep=…]`
  - SSE when `follow=1`, otherwise snapshot JSON or NDJSON.
- `POST /api/hosts/:hostId/containers/:id/actions` → optional start/stop/restart (Phase 2, admin only).

### Host Logs (allowlist)
- `GET /api/hostlogs` → list allowlisted logs with human names and absolute paths (server-side only).
- `GET /api/hostlogs/:name[?follow&tail=1000&since=86400&timestamps=1&grep=…]` → stream or snapshot.

### Downloads (admin)
- `GET /api/logs/download?scope=container|hostlog&id=<cid|name>&tail=5000`

### Auth/Session
- Reuse existing login endpoints; confirm cookie flags and CSRF for POST routes.
- 401/403 behavior clearly documented.

## UI Plan
- **Pages**
  - `/` → Containers list (host switcher, filters, search, sort).
  - `/host-logs` → Allowlisted host logs grid.
  - `/containers/:hostId/:id` → Tabs: Overview | Logs | Inspect | Stats.
- **Components**
  - `HostSwitcher`, `ContainersTable`, `LogsViewer` (virtualized + SSE), `StatsPanel`, `InspectPanel`, `SearchBar`, `FilterChips`, `PinnedBadge`.
- **Wireframe-as-text**
  - Topbar: HostSwitcher • Search • Filters • Pinned toggle
  - Table: Name | Image | Status | CPU | Mem | Uptime | Labels
  - Row click → Detail view with tabs; Logs tab shows Viewer with Follow/Pause, Tail, Grep, Copy, Download (admin).

## Data/State Plan
- **Client**: TanStack Query for lists; URL params for search/filter/sort; localStorage for last host + pinned containers; SSE subscriptions managed per tab (cleanup on unmount).
- **Server**: dockerode wrapper per-host; hostlogs registry (name → absolute path); rate-limit store; RBAC checkers.
- **Env**: `PORT`, `SESSION_SECRET`, `REDIS_URL`, `HOSTS_JSON` (optional per-host config), `ALLOWLIST_LOGS_JSON`.

## Execution Plan
### Phase 1 (Minimum Dozzle++)
1. Repo audit & “Current State” report (server, client, nginx notes).
2. Define host map & allowlist (JSON), add `/api/hosts` route.
3. Implement `/containers` list + details API per host.
4. Implement logs API with SSE; build `LogsViewer` (snapshot + follow + grep + tail + timestamps).
5. Host logs page using allowlist (`/api/hostlogs` + `/api/hostlogs/:name`).
6. Stats panel baseline from docker stats (piapps only).
7. RBAC gates & download endpoint (admin only).
8. E2E cURL smoke tests + UI manual checklist.

### Phase 2 (Nice-to-have)
1. Loki/Promtail pipeline and Grafana dashboard links.
2. Saved views and alert presets.
3. Remote stats for Synology; minimal actions (start/stop/restart) behind admin.

## Gaps / Risks / Unknowns (raise questions)
- Confirm existing session/CSRF/rate-limit middleware and cookie flags.
- Verify presence of dockerode and current use patterns.
- Clarify how Synology Dozzle is addressed (exact URL/port) for “Open in Dozzle” links.
- Confirm allowlist entries and absolute paths under `/home/zk/logs`.
- Decide single source of truth for stats (docker stats vs cAdvisor) to avoid double-load.

## Handoff Requirements (deliverables from Planning Mode)
1. **Current State** report with file anchors.
2. **API Spec v1** finalized with examples.
3. **UI component checklist** with props and event contracts.
4. **cURL scripts** for smoke testing:
   - `curl -sS -b "$CK" "$BASE/api/hosts" | jq .`
   - `curl -sS -b "$CK" "$BASE/api/hosts/piapps/containers" | jq '.[0:5]'`
   - `curl -N -sS -b "$CK" "$BASE/api/hosts/piapps/containers/<cid>/logs?follow=1&tail=200"`
   - `curl -sS -b "$CK" "$BASE/api/hostlogs" | jq .`
   - `curl -N -sS -b "$CK" "$BASE/api/hostlogs/nginx?follow=1&tail=300&timestamps=1"`

### Model & Run Instructions (Opencode / OpenRouter)
- **Suggested planning model:** `anthropic/claude-3.5-sonnet:latest`
- **Run example:**
  ```bash
  opencode -m anthropic/claude-3.5-sonnet:latest -p plan.md
  ```

# End of planning brief — do not write code. Produce the plan and handoff only.
