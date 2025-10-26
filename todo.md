# 🔧 Fixit — Implement Grafana & Prometheus log viewing (and ensure they actually log)

**Model:** Anthropic **Claude Sonnet 4.5**  
**Repo:** `/home/zk/projects/ContainerYard`  
**App URL:** `https://container.piapps.dev/host-logs`

We want the **Grafana** and **Prometheus** cards on the Host Logs page to display logs from **host files**:
- **Grafana:** `/var/log/grafana/grafana.log`
- **Prometheus:** `/var/log/prometheus/prometheus.log`

If those files are empty/missing because the containers are not producing file logs, investigate and **enable file logging** for both services (within the crypto‑agent stack).

---

## Deliverables (acceptance criteria)

1) **UI:** On `/host-logs`, clicking **Grafana** or **Prometheus** opens a modal showing recent lines from the log files above (with tail/since/grep/follow controls). No blank panes.  
2) **API:** `GET /api/hostlogs/grafana` and `GET /api/hostlogs/prometheus` read from the exact file paths above (tail/since/grep/follow). If the file is unavailable, return JSON like `{available:false, reason:"not_found"|"permission"|"empty", details:{path}}`.  
3) **Containers log to files:** If the log files don’t exist or are always empty, fix the **Docker stack** so **Grafana** and **Prometheus** actually write logs into those paths (inside the host) and keep them updating.  
4) **Permissions:** The web process user (likely `www-data`/node process) can read those files (group `adm` or proper ACL). Do **not** open arbitrary paths.  
5) **Docs:** A short note in the repo explaining where these logs live and how they’re wired.  
6) **Tests:** Minimal unit/integration tests to prevent regressions (see below).

---

## Implementation Plan

### A) Server: allowlist + routes

**Edit / add:** `server/config/hostlogs.ts`
```ts
export const HOST_LOGS = {
  grafana:    '/var/log/grafana/grafana.log',
  prometheus: '/var/log/prometheus/prometheus.log',
  nginx_access: '/var/log/nginx/container.piapps.dev.access.log',
  nginx_error:  '/var/log/nginx/container.piapps.dev.error.log',
  pm2_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
  pm2_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
  freqtrade:    '/home/zk/bots/crypto-agent/user_data/logs/freqtrade.log',
} as const;
```

**Edit / add:** `server/routes/hostLogs.ts`
- Implement `GET /api/hostlogs/:name` to:
  - Validate `name` is in `HOST_LOGS`; otherwise 404.
  - Parse `tail` (default 500, max 5000), `since` (ISO or seconds, clamp ≤ 7d), `grep`, `timestamps` (0/1), `follow` (0/1).
  - If file exists and readable → tail/stream content.
  - If file missing → JSON `{available:false, reason:"not_found", details:{path}}`.
  - If exists but size 0 → `{available:false, reason:"empty", details:{path}}`.
  - `follow=1` uses fs tail + SSE.
  - Set `Content-Type: text/plain` on success.

**Edit:** `server/index.ts`
- Mount the host logs router **after** auth middleware & rate limiter:
  ```ts
  app.use('/api/hostlogs', hostLogsRouter);
  ```

### B) Client: always open modal, show reason

**Edit:** `client/src/pages/HostLogs.tsx`
- Cards for grafana/prometheus should **not** be permanently disabled. Clicking opens modal and requests `/api/hostlogs/<name>?tail=200`.
- If API returns `{available:false,...}` show a red inline banner in the modal with humanized reason (“File not found”, “Permission denied”, “File is empty”), include `details.path`.

**Edit:** `client/src/components/LogsViewer.tsx`
- Recognize error JSON and render banner; avoid a blank log area.

### C) Ensure the containers actually log to the specified files

These two images by default emit logs to **stdout/stderr**; we need to write to host files:

#### Grafana
- **File logging support exists**. Set environment and mount the host directory.

**Likely compose file:** `/home/zk/bots/crypto-agent/docker-compose.yml` (adjust if different).

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_LOG_MODE=file
      - GF_PATHS_LOGS=/var/log/grafana
      # Optional: verbosity
      - GF_LOG_LEVEL=info
    volumes:
      - /var/log/grafana:/var/log/grafana
      # ... existing grafana data/config volumes ...
    # (Keep ports/networks as they are)
```

> Result: Grafana writes `/var/log/grafana/grafana.log` inside container → mounted to host at `/var/log/grafana/grafana.log`.

#### Prometheus
- Prometheus **does not** natively write to a file; it writes to stdout.
- Wrap the entrypoint to tee output to our host file while keeping stdout (so `docker logs` still works).

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    # Ensure /var/log/prometheus exists on host
    volumes:
      - /var/log/prometheus:/var/log/prometheus
      # ... existing prometheus config/data volumes ...
    command: >
      sh -c '
        mkdir -p /var/log/prometheus &&
        exec prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus --web.enable-lifecycle 2>&1
        | tee -a /var/log/prometheus/prometheus.log
      '
```

- This keeps runtime output and creates `/var/log/prometheus/prometheus.log` in the container, persisted to the host via the volume.

#### Permissions (host)
Make sure the log directories exist and are readable by the app user (no need to make them world-readable). On the **Pi host**:

```bash
# Create dirs if missing
sudo /bin/mkdir -p /var/log/grafana /var/log/prometheus

# Ownership: docker daemon often runs as root; use adm group for read sharing
sudo /bin/chgrp -R adm /var/log/grafana /var/log/prometheus
sudo /bin/chmod -R g+rX /var/log/grafana /var/log/prometheus

# Ensure web user is in adm (one-time)
sudo /usr/sbin/usermod -aG adm www-data 2>/dev/null || true
```

- After changing compose, **recreate** the two containers:
```bash
cd /home/zk/bots/crypto-agent
/usr/bin/docker compose up -d grafana prometheus
```

### D) Diagnostics route (helps future debugging)

Add admin-only route to quickly inspect file existence/size and last mtime, e.g. `GET /api/hostlogs/_diag` returning:
```json
{
  "paths": {
    "grafana": {"path":"/var/log/grafana/grafana.log","exists":true,"size":12345,"mtime":"2025-10-26T09:20:14Z","readable":true},
    "prometheus": {"path":"/var/log/prometheus/prometheus.log","exists":true,"size":4567,"mtime":"2025-10-26T09:20:02Z","readable":true}
  }
}
```
The UI can call this for a tiny badge like “Available / Empty / Not Found”.

---

## Tests (please add)

### Server unit (jest)
- Tail happy path on an existing tmp file.
- ENOENT → `{available:false,reason:"not_found"}`.
- Size 0 → `{available:false,reason:"empty"}`.
- Follow mode opens SSE and streams new lines.

### API integration (supertest)
- Mock fs to simulate each reason for grafana/prometheus.
- Assert `text/plain` on success and `application/json` with structured reasons on error.

### Manual smoke (after deploy)
```bash
CK=/tmp/pideck.cookies; rm -f "$CK"
curl -sS -c "$CK" -H 'Content-Type: application/json'   -H 'Origin: https://container.piapps.dev'   -X POST https://container.piapps.dev/api/auth/login   --data '{"password":"<ADMIN_PASSWORD>"}' | jq .

# Confirm files exist and have size
sudo ls -l /var/log/grafana/grafana.log /var/log/prometheus/prometheus.log

# Read via API
curl -sS -b "$CK" "https://container.piapps.dev/api/hostlogs/grafana?tail=50" | sed -n '1,10p'
curl -sS -b "$CK" "https://container.piapps.dev/api/hostlogs/prometheus?tail=50" | sed -n '1,10p'
```

---

## Commit message
```
feat(logs): show Grafana/Prometheus logs from /var/log/* and enable file logging in containers

- Server: allowlist + routes for /api/hostlogs/grafana|prometheus with tail/since/grep/follow
- Client: open modal even if unavailable; show reason (not_found/permission/empty)
- Compose: GF_LOG_MODE=file + volume /var/log/grafana; prometheus entrypoint tee → /var/log/prometheus/prometheus.log
- Perms: ensure web process can read /var/log/grafana and /var/log/prometheus
- Add minimal diagnostics route for future checks
```
