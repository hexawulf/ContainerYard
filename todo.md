# ContainerYard → Dozzle++ Execution Plan
**Generated**: 2025-10-26  
**Planning Model**: Claude 3.5 Sonnet  
**Executor**: DeepSeek (or compatible model)  
**Mode**: READ-ONLY analysis complete; ready for implementation

---

## Executive Summary

ContainerYard is a Docker container monitoring dashboard currently supporting:
- Multi-host architecture (piapps via Docker socket, synology via cAdvisor)
- Container listing, details, stats with real-time polling
- Live log streaming (SSE) for Docker hosts
- Host log viewing with allowlist-based file access
- Session-based auth with RBAC (VIEWER/ADMIN roles)
- Redis sessions, CSRF protection, rate limiting

**Goal**: Evolve ContainerYard into a **Dozzle-class** log/inspect dashboard with enhanced features while maintaining security-first approach.

---

## Current State Summary

### 1. Endpoints & Auth (✅ Already Implemented)

**Authentication & Session**
- `POST /api/auth/login` - Session-based login (bcrypt passwords)
- `POST /api/auth/logout` - Session destroy + cookie clear
- `GET /api/auth/me` - Current user info
- `GET /api/auth/csrf` - CSRF token endpoint

**Session Configuration** (`server/src/config/session.ts`)
- Store: Redis (connect-redis)
- Cookie flags: `httpOnly: true`, `sameSite: lax/strict/none`, `secure: true` in prod
- Session lifetime: 8 hours
- CSRF protection: csurf middleware active on all routes

**Rate Limiting** (`server/src/middleware/auth.ts`)
- Global: 1000 req/15min window
- Login: 10 attempts/15min window
- Standard headers: draft-7

**RBAC** (`server/src/middleware/auth.ts`)
- Roles: VIEWER, ADMIN
- Middleware: `requireAuth()`, `requireRole(...roles)`
- Admin-only endpoints marked explicitly

### 2. Logs Implementation (✅ Solid Foundation)

**Container Logs** (`server/src/routes/hosts.ts`)
- `GET /api/hosts/:hostId/containers/:containerId/logs` - Snapshot (tail, since, grep, stdout/stderr)
  - Tail limit: 1-5000 lines
  - Grep: case-insensitive substring search with basic regex escaping
  - Returns JSON: `{ content: string, truncated: boolean }`
- `GET /api/hosts/:hostId/containers/:containerId/logs/stream` - SSE streaming
  - Headers: `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
  - Events: `line`, `error`
  - Heartbeat: 15s interval
  - Cleanup on client disconnect

**Host Logs** (`server/src/routes/hostLogs.ts`)
- `GET /api/hostlogs` - List allowlisted logs with existence check
- `GET /api/hostlogs/:name` - Snapshot or SSE stream
  - Allowlist: `HOST_LOGS` from `server/src/config/hostlogs.ts`
  - Docker fallback for grafana/prometheus (uses `docker logs` if file missing)
  - Tail, since, grep, timestamps, follow params
  - SSE mode: `tail -f` with heartbeat
  - Returns plain text or SSE stream

**Allowlist** (`server/src/config/hostlogs.ts`)
```typescript
export const HOST_LOGS: Record<string, string> = {
  nginx_access: '/var/log/nginx/container.piapps.dev.access.log',
  nginx_error:  '/var/log/nginx/container.piapps.dev.error.log',
  pm2_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
  pm2_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
  grafana:      '/var/log/grafana/grafana.log',
  prometheus:   '/var/log/prometheus/prometheus.log',
};
```

### 3. Container Discovery (`server/src/routes/hosts.ts`)

**Host Management** (`server/src/config/hosts.ts`)
- Two hosts defined:
  - `piapps`: Docker socket (`/var/run/docker.sock`)
  - `synology`: cAdvisor-only (SYNOLOGY_CADVISOR_URL env var)
- Host provider types: `DOCKER`, `CADVISOR_ONLY`

**Container Endpoints**
- `GET /api/hosts` - List all hosts
- `GET /api/hosts/:hostId/containers` - List containers
  - Docker: Uses dockerode
  - cAdvisor: Fetches from cAdvisor API
- `GET /api/hosts/:hostId/containers/:containerId` - Container details (inspect)
- `GET /api/hosts/:hostId/containers/:containerId/stats` - Real-time stats

**Docker Integration** (`server/src/services/docker.ts`)
- Library: dockerode
- Socket: Local UNIX socket only (`/var/run/docker.sock`)
- No TCP socket exposure ✅

### 4. Metrics (`server/src/services/`)

**Sources**
- Docker stats API (CPU%, mem%, net I/O, block I/O) via dockerode
- cAdvisor for Synology host (`server/src/services/cadvisor.ts`)
- Host-level stats available via `GET /api/hosts/:hostId/stats`

**Stats Polling**
- Client polls every 2-5s (Dashboard.tsx)
- Rolling history: 30 data points (client-side only)

### 5. Client UX (`client/src/`)

**Pages**
- `/` - Landing page
- `/login` - Login form
- `/dashboard` - Main container dashboard
- `/host-logs` - Host log viewer grid
- `/styleguide` - Component showcase

**Components**
- `HostSwitcher` - Dropdown for host selection
- `ContainerTable` - List with status badges, CPU/mem display
- `LogsDrawer` - Sheet/drawer with log viewer for containers
- `LogsViewer` - Reusable virtualized log viewer (SSE + snapshot modes)
- `InspectModal` - JSON inspect view
- `StatsPanel` - Container overview with sparklines
- `StatsChips` - Real-time metric chips

**State Management**
- TanStack Query for API calls
- LocalStorage: selected host ID
- No global state library

**Routing**
- Library: wouter (lightweight React router)

---

## Gap Analysis (What's Missing for Dozzle-Class Feature Set)

### ✅ Already Implemented
1. Multi-host architecture with provider abstraction
2. Session-based auth with RBAC
3. Container listing with stats
4. Live log streaming (SSE) with grep/tail/since
5. Host log viewing with allowlist
6. Virtualized log viewer component
7. Download capability (client-side blob download in LogsDrawer)

### ⚠️ Needs Enhancement
1. **Search/Filter UI Improvements**
   - Add advanced filter chips (state, labels, image)
   - Add sort controls (by name, CPU, mem, uptime)
   - Persist filter/sort preferences in localStorage
   
2. **Log Viewer Polish**
   - Server-side download endpoint for admin (`GET /api/logs/download`)
   - Saved searches (already in DB schema, need UI integration)
   - Log bookmarks (already in DB schema, need UI integration)
   - Syntax highlighting for common log formats
   - Timestamp parsing/formatting options

3. **Container Actions** (Optional - Phase 2)
   - Start/stop/restart controls (admin-only)
   - Already scaffolded in old routes.ts but not in new API
   
4. **Stats Enhancements**
   - Historical stats beyond 30 points (consider Prometheus integration)
   - Alert thresholds on metrics (Phase 2)

5. **Documentation**
   - API reference doc with curl examples
   - Deployment guide updates
   - User guide for log search/filter syntax

### ❌ Missing (Lower Priority)
1. Loki/Promtail integration (Phase 2)
2. Saved views/presets (Phase 2)
3. Remote stats for Synology (cAdvisor already provides this)

---

## Execution Plan (Ordered Tasks)

### Phase 1: Core Dozzle++ Features (Priority: High)

#### Task 1: Server-Side Log Download Endpoint (Admin-Only)
**Files to modify:**
- `server/src/routes/logDownload.ts` (already exists, verify implementation)
- `server/src/middleware/auth.ts` (ensure `requireRole('ADMIN')` is used)

**Requirements:**
- Endpoint: `GET /api/logs/download?scope=container|hostlog&hostId=X&id=Y&tail=N`
- Headers: `Content-Type: text/plain`, `Content-Disposition: attachment; filename="..."`
- Enforce `requireRole('ADMIN')` middleware
- Validate scope, hostId, id, tail params (zod schema)
- Tail limit: 1-10000 lines (higher than snapshot limit)
- Stream response (no buffering entire log in memory)

**Acceptance:**
```bash
curl -b "$COOKIE" "$API/logs/download?scope=container&hostId=piapps&id=abc123&tail=1000" -o test.log
# Should return 403 for VIEWER role
# Should return 200 + file for ADMIN role
```

#### Task 2: Enhanced Container Filters & Sort
**Files to modify:**
- `client/src/pages/Dashboard.tsx`
- `client/src/features/monitoring/ContainerTable.tsx`

**Requirements:**
- Add filter chips: state (running/exited/all), label selector, image filter
- Add sort dropdown: name (asc/desc), CPU (desc), mem (desc), uptime (desc)
- Persist filters/sort in localStorage (`cy.containerFilters`, `cy.containerSort`)
- Apply filters/sort client-side (no backend change needed for MVP)

**Acceptance:**
- User can filter containers by state, label, image
- User can sort by name, CPU, mem, uptime
- Filters/sort persist across page reloads

#### Task 3: Saved Searches Integration
**Files to modify:**
- `client/src/components/SavedSearches.tsx` (already exists)
- `client/src/features/monitoring/LogsDrawer.tsx`
- `client/src/components/LogsViewer.tsx`

**Requirements:**
- Display saved searches in LogsViewer settings panel
- One-click apply saved search (pre-fill grep, tail, since)
- Create new saved search from current settings
- Delete saved search (admin-only or own searches)

**Backend already exists:**
- `GET /api/saved-searches`
- `POST /api/saved-searches`
- `DELETE /api/saved-searches/:id`

**Acceptance:**
- User can save log search presets
- User can apply saved search with one click
- Admin can manage all saved searches

#### Task 4: Log Bookmarks Integration
**Files to modify:**
- `client/src/components/LogBookmarks.tsx` (already exists)
- `client/src/features/monitoring/LogsDrawer.tsx`
- `client/src/components/LogsViewer.tsx`

**Requirements:**
- Add "Bookmark" button in log viewer (bookmark current line/timestamp)
- Display bookmarks in sidebar or separate panel
- Jump to bookmarked timestamp
- Delete bookmark

**Backend already exists:**
- `GET /api/bookmarks`
- `POST /api/bookmarks`
- `DELETE /api/bookmarks/:id`

**Acceptance:**
- User can bookmark log lines
- User can jump to bookmarked timestamps
- Bookmarks persist across sessions

#### Task 5: Improved Download UX
**Files to modify:**
- `client/src/features/monitoring/LogsDrawer.tsx`
- `client/src/components/LogsViewer.tsx`

**Requirements:**
- Replace client-side blob download with server download endpoint (Task 1)
- Show progress indicator for large downloads
- Disable download button for VIEWER role (check user.role)
- Add download button to host logs viewer

**Acceptance:**
- ADMIN can download container logs via server endpoint
- ADMIN can download host logs via server endpoint
- VIEWER sees disabled download button with tooltip

#### Task 6: Log Syntax Highlighting (Optional Polish)
**Files to modify:**
- `client/src/lib/logParser.ts` (already exists)
- `client/src/components/LogsViewer.tsx`

**Requirements:**
- Detect common log formats (ISO timestamps, log levels, JSON)
- Apply color coding to log levels (ERROR=red, WARN=yellow, INFO=blue, DEBUG=gray)
- Use existing logParser.ts utilities
- Add toggle to enable/disable syntax highlighting

**Acceptance:**
- Logs with timestamps/levels are color-coded
- User can toggle syntax highlighting on/off

### Phase 2: Nice-to-Have Enhancements (Priority: Medium)

#### Task 7: Container Actions (Admin-Only)
**Files to modify:**
- `server/src/routes/hosts.ts` (add action endpoint)
- `client/src/features/monitoring/ContainerTable.tsx`
- `client/src/features/monitoring/StatsPanel.tsx`

**Requirements:**
- Endpoint: `POST /api/hosts/:hostId/containers/:id/actions` (body: `{ action: "start"|"stop"|"restart" }`)
- Require `requireRole('ADMIN')`
- Docker-only (no cAdvisor support)
- Client: Add action buttons to container table/detail view
- Confirmation dialog for destructive actions

**Acceptance:**
```bash
curl -X POST -b "$COOKIE" -H "Content-Type: application/json" \
  -d '{"action":"restart"}' \
  "$API/hosts/piapps/containers/abc123/actions"
# Should return 403 for VIEWER
# Should return 200 for ADMIN
```

#### Task 8: Prometheus/Loki Integration (Phase 2)
**Files to create:**
- `server/src/services/prometheus.ts`
- `server/src/services/loki.ts`
- `client/src/components/PrometheusLink.tsx`

**Requirements:**
- Add Prometheus query links for container metrics
- Add Loki query links for log search (if Loki is deployed)
- Env vars: `PROMETHEUS_URL`, `LOKI_URL`
- UI: "Open in Prometheus" / "Open in Loki" buttons

**Acceptance:**
- Links generate correct PromQL/LogQL queries
- Links open in new tab to external tools

#### Task 9: Alert Presets (Phase 2)
**Files to create:**
- `server/src/routes/alerts.ts`
- `prisma/schema.prisma` (add Alert model)
- `client/src/components/AlertManager.tsx`

**Requirements:**
- Define alert rules (e.g., "notify when CPU > 80% for 5min")
- Store in database
- Trigger notifications (email/webhook)

**Acceptance:**
- Admin can create/edit/delete alert rules
- Alerts trigger based on real-time stats

### Phase 3: Documentation & Testing

#### Task 10: API Reference Documentation
**Files to create:**
- `docs/API.md`

**Requirements:**
- Document all endpoints with curl examples
- Include auth requirements (viewer/admin)
- Parameter validation rules
- Response schemas

#### Task 11: Smoke Tests
**Files to modify:**
- `scripts/smoke.sh` (verify it covers new endpoints)

**Requirements:**
- Add tests for download endpoint
- Add tests for saved searches/bookmarks
- Verify rate limits

#### Task 12: E2E Tests
**Files to modify:**
- `e2e/*.spec.ts`

**Requirements:**
- Test log viewer (snapshot + streaming)
- Test filters/sort
- Test download (admin vs viewer)

---

## API Spec Summary (for Executor Reference)

### Authentication
- `POST /api/auth/login` - Login (body: `{ email, password }`)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user
- `GET /api/auth/csrf` - CSRF token

### Hosts & Containers
- `GET /api/hosts` - List hosts
- `GET /api/hosts/:hostId/stats` - Host-level stats
- `GET /api/hosts/:hostId/containers` - List containers
- `GET /api/hosts/:hostId/containers/:id` - Container details
- `GET /api/hosts/:hostId/containers/:id/stats` - Container stats
- `GET /api/hosts/:hostId/containers/:id/logs` - Snapshot logs (query: tail, since, grep, stdout, stderr)
- `GET /api/hosts/:hostId/containers/:id/logs/stream` - SSE stream (query: stdout, stderr, grep)

### Host Logs
- `GET /api/hostlogs` - List allowlisted logs
- `GET /api/hostlogs/:name` - Snapshot or stream (query: tail, since, grep, timestamps, follow)

### Downloads (Admin-Only)
- `GET /api/logs/download` - Download logs (query: scope, hostId, id, tail)

### Saved Searches
- `GET /api/saved-searches` - List saved searches
- `POST /api/saved-searches` - Create (body: `{ name, containerName?, grep, tail, since }`)
- `DELETE /api/saved-searches/:id` - Delete

### Bookmarks
- `GET /api/bookmarks` - List bookmarks
- `POST /api/bookmarks` - Create (body: `{ containerName, line, timestamp }`)
- `DELETE /api/bookmarks/:id` - Delete

### Health & Metrics
- `GET /api/health` - Health check
- `GET /api/metrics` - Prometheus metrics (if METRICS_TOKEN set)

---

## Security Checklist (Pre-Implementation Verification)

✅ **CSRF Protection**: csurf active on all routes  
✅ **Rate Limiting**: Global + login-specific limits  
✅ **Session Security**: httpOnly, secure, sameSite cookies  
✅ **RBAC**: requireAuth + requireRole middleware  
✅ **No TCP Docker Socket**: Local UNIX socket only  
✅ **No Arbitrary File Reads**: Strict allowlist for host logs  
✅ **Input Validation**: Zod schemas for login, params  
✅ **Helmet**: Security headers enabled  
✅ **CORS**: Allowlist-based origin validation  

---

## Smoke Test Script (Example)

```bash
#!/bin/bash
set -e

API_BASE="http://localhost:5008/api"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASS="your-admin-password"

# 1. Login as admin
echo "Logging in..."
COOKIE=$(curl -s -c - -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | grep cy.sid | awk '{print $NF}')

# 2. List hosts
echo "Fetching hosts..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/hosts" | jq .

# 3. List containers (piapps)
echo "Fetching containers..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/hosts/piapps/containers" | jq '.[0:3]'

# 4. Get container logs (snapshot)
CONTAINER_ID=$(curl -s -b "cy.sid=$COOKIE" "$API_BASE/hosts/piapps/containers" | jq -r '.[0].id')
echo "Fetching logs for $CONTAINER_ID..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/hosts/piapps/containers/$CONTAINER_ID/logs?tail=50" | jq .

# 5. Stream logs (SSE) - press Ctrl+C to stop
echo "Streaming logs (SSE)..."
curl -N -s -b "cy.sid=$COOKIE" "$API_BASE/hosts/piapps/containers/$CONTAINER_ID/logs/stream?stdout=true&stderr=true"

# 6. Host logs
echo "Fetching host logs list..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/hostlogs" | jq .

echo "Fetching nginx access log..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/hostlogs/nginx_access?tail=20" | head -20

# 7. Download logs (admin-only)
echo "Downloading logs..."
curl -s -b "cy.sid=$COOKIE" "$API_BASE/logs/download?scope=container&hostId=piapps&id=$CONTAINER_ID&tail=500" -o /tmp/test-download.log
wc -l /tmp/test-download.log

echo "✅ All smoke tests passed"
```

---

## Environment Variables Reference

```bash
# Core
NODE_ENV=production
PORT=5008

# Auth & Session
SESSION_SECRET=<32+ char random string>
COOKIE_NAME=cy.sid
COOKIE_DOMAIN=.piapps.dev
COOKIE_SAMESITE=lax
ALLOWED_ORIGINS=https://container.piapps.dev,https://containeryard.org
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/containeryard

# Admin Bootstrap
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<12+ char secure password>

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# Synology
SYNOLOGY_CADVISOR_URL=http://synology.local:8080
SYNOLOGY_DOZZLE_URL=http://synology.local:8888

# Optional
METRICS_TOKEN=<secret token for /api/metrics>
PROMETHEUS_URL=http://localhost:9090
LOKI_URL=http://localhost:3100
```

---

## Implementation Notes for Executor

### Order of Execution
1. Start with Task 1 (download endpoint) - low risk, high value
2. Then Task 2 (filters/sort) - client-side only
3. Then Task 3 & 4 (saved searches/bookmarks) - backend already done
4. Then Task 5 (download UX) - depends on Task 1
5. Optional: Task 6 (syntax highlighting)
6. Phase 2: Tasks 7-9 as needed

### Testing Strategy
- After each task, run smoke tests
- Update e2e tests for new features
- Verify RBAC enforcement (test with viewer + admin accounts)

### Rollback Plan
- Each task should be implemented in a separate commit
- Tag stable versions
- Keep feature flags for risky changes (e.g., container actions)

### Deployment
- Use existing PM2 ecosystem config
- Verify Nginx proxy settings
- Check Redis connection
- Run DB migrations (Prisma)

---

## Handoff Checklist

- [x] Current state documented with file anchors
- [x] Gap analysis complete
- [x] API spec verified against code
- [x] Security checklist reviewed
- [x] Execution plan ordered by priority
- [x] Smoke test examples provided
- [x] Environment variables documented
- [ ] Ready for executor to implement

---

## Questions for Human Review (Before Execution)

1. **Download Endpoint**: Should we enforce additional rate limits for download endpoint (e.g., 10 downloads/hour)?
2. **Saved Searches**: Should saved searches be global (all users see them) or per-user?
3. **Log Bookmarks**: Should bookmarks be tied to container ID + timestamp, or allow free-text notes?
4. **Container Actions**: Do we want start/stop/restart in Phase 1, or defer to Phase 2?
5. **Synology Logs**: Should we attempt SSH log fetching for Synology, or keep Dozzle redirect-only?
6. **Stats History**: Should we persist stats history in Redis/Postgres, or keep client-side only?

---

## Success Metrics

After execution, ContainerYard should achieve:
- ✅ Dozzle-class log viewer (SSE streaming, grep, tail, since)
- ✅ Admin log downloads (server-side, enforced RBAC)
- ✅ Enhanced container filters/sort
- ✅ Saved searches + bookmarks
- ✅ Multi-host support (piapps + synology)
- ✅ Security-first (no arbitrary file access, RBAC enforced)
- ✅ Production-ready (rate limits, CSRF, sessions, HTTPS)

**Target Completion**: 2-3 days for Phase 1 (Tasks 1-6)

---

**End of Execution Plan**
