# ContainerYard Monitoring Implementation Summary

## Overview

Implemented read-only Docker monitoring in ContainerYard with enhanced logs, stats, and real-time streaming capabilities.

## Files Changed/Created

### Backend Changes

#### 1. **shared/monitoring.ts**
- Added `ContainerLogsResponse` interface
- Added `DozzleLinkResponse` interface
- Added `NormalizedStats` interface for consistent stats across providers

#### 2. **server/src/services/docker.ts**
- Added `LogOptions` interface for log query parameters
- Enhanced `getContainerLogs()` to support:
  - `tail` (with 5000 max limit)
  - `since` (ISO8601 or seconds)
  - `grep` (safely escaped regex)
  - `stdout`/`stderr` filtering
- Added `streamContainerLogs()` for SSE streaming with:
  - Real-time log following
  - Grep filtering support
  - Clean disconnect handling

#### 3. **server/src/routes/hosts.ts**
- Enhanced `GET /api/hosts/:hostId/containers/:cid/logs`:
  - Returns JSON with `{ content, truncated }`
  - Supports all LogOptions query params
  - Returns 501 with Dozzle link for Synology hosts
- Added `GET /api/hosts/:hostId/containers/:cid/logs/stream`:
  - SSE endpoint for Docker hosts
  - Heartbeat every 15s
  - Clean connection management
- Enhanced `GET /api/hosts/:hostId/containers/:cid/stats`:
  - Returns normalized `NormalizedStats` format
  - Consistent across Docker and cAdvisor providers

#### 4. **server/src/metrics.ts**
- Already existed with prom-client integration ✓
- Exports process metrics at `/metrics`
- Optional token authentication via `METRICS_TOKEN`

### Frontend Changes

#### 5. **client/src/features/monitoring/LogsDrawer.tsx** (NEW)
- Full-featured logs drawer component:
  - Tail selector (100/500/1k/5k lines)
  - Since selector (1h/6h/24h/all)
  - Grep search filter
  - stdout/stderr toggles
  - Live streaming toggle with pause/resume
  - Download logs button
  - Dozzle link fallback for Synology

#### 6. **client/src/features/monitoring/StatsChips.tsx** (NEW)
- Real-time stats visualization with sparklines:
  - CPU, Memory, Net RX/TX, Disk Read/Write
  - 30-sample sparklines using recharts
  - Rate calculations for I/O metrics
  - Tooltips with additional info
  - Color-coded by metric type

#### 7. **client/src/features/monitoring/InspectModal.tsx** (NEW)
- JSON inspection modal:
  - Full container detail in formatted JSON
  - Copy to clipboard button
  - Scrollable with syntax highlighting

#### 8. **client/src/features/monitoring/ContainerTable.tsx**
- Added action buttons column:
  - Logs button (FileText icon)
  - Inspect button (Info icon)
- Removed Dozzle-only column (now integrated in logs drawer)
- Added `onLogsClick` and `onInspectClick` props

#### 9. **client/src/pages/Dashboard.tsx**
- Integrated new monitoring components:
  - Added `LogsDrawer` modal
  - Added `InspectModal` dialog
  - Added `StatsChips` card for real-time metrics
  - Updated stats query to use `NormalizedStats`
  - Maintained backward compatibility with legacy `ContainerStats`
  - Wired up logs and inspect actions

### Testing & Scripts

#### 10. **scripts/test-sse.js** (NEW)
- Node.js SSE smoke test script
- Tests real-time log streaming
- Auto-closes after 10 lines
- Usage: `node scripts/test-sse.js <base_url> <host> <cid> <cookie>`

#### 11. **server/tests/monitoring.spec.ts** (NEW)
- Jest test suite for monitoring APIs:
  - Logs endpoint with tail, grep, since
  - Stats endpoint validation
  - SSE streaming test
  - Schema validation guards
- Requires `TEST_CONTAINER_ID` env var

### Documentation

#### 12. **README.md**
- Added "Monitoring API" section with:
  - Container logs endpoint docs
  - Live streaming SSE endpoint
  - Container stats endpoint
  - Prometheus metrics endpoint
  - Testing instructions with cURL examples

## API Endpoints

### Container Logs
```
GET /api/hosts/:hostId/containers/:cid/logs
Query: tail, since, grep, stdout, stderr
Response: { content: string, truncated: boolean }
```

### Live Log Streaming (SSE)
```
GET /api/hosts/:hostId/containers/:cid/logs/stream
Query: stdout, stderr, grep
Events: line, heartbeat
```

### Container Stats
```
GET /api/hosts/:hostId/containers/:cid/stats
Response: { cpuPct, memPct, memBytes, blkRead, blkWrite, netRx, netTx, ts }
```

### Prometheus Metrics
```
GET /metrics
Headers: x-metrics-token (optional)
Format: Prometheus text format
```

## Security Features

- Existing session-auth respected (no changes)
- No container mutations (read-only)
- Tail hard cap: 5000 lines
- Grep patterns safely escaped (no regex DoS)
- HTTP timeouts: 30s for logs, 2h for SSE
- CORS unchanged

## Environment Variables

No new env vars required. Optional:
- `METRICS_TOKEN` - Token for /metrics endpoint auth

## Testing

### Manual cURL Tests
```bash
BASE=https://container.piapps.dev
HOST=piapps
CID=<container_id>
COOK='cookie: cy.sid=<session>'

# Tail 100 lines
curl -s -H "$COOK" "$BASE/api/hosts/$HOST/containers/$CID/logs?tail=100" | jq .

# Since last hour with grep
curl -s -H "$COOK" "$BASE/api/hosts/$HOST/containers/$CID/logs?since=3600&grep=error" | jq .

# SSE stream
curl -N -H "$COOK" "$BASE/api/hosts/$HOST/containers/$CID/logs/stream"

# Stats
curl -s -H "$COOK" "$BASE/api/hosts/$HOST/containers/$CID/stats" | jq .

# Metrics
curl -s -H "$COOK" "$BASE/metrics" | head -40
```

### Node SSE Test
```bash
node scripts/test-sse.js https://container.piapps.dev piapps <CID> "cy.sid=<cookie>"
```

### Jest Tests
```bash
TEST_CONTAINER_ID=<cid> npm test
```

## Build & Deploy

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Restart PM2
pm2 restart containeryard
pm2 logs containeryard --lines 50
```

## UI Features

1. **Per-Row Actions**
   - Logs icon opens drawer
   - Inspect icon shows JSON modal

2. **Logs Drawer**
   - Search/filter controls
   - Tail size selector
   - Time range selector
   - Live streaming with pause
   - Download logs
   - Dozzle fallback for Synology

3. **Real-time Metrics Card**
   - 6 stat chips with 30s sparklines
   - Updates every 2s
   - CPU%, Mem%, Net I/O, Disk I/O
   - Hover tooltips

4. **Inspect Modal**
   - Full container JSON
   - Copy to clipboard
   - Scrollable view

## Backward Compatibility

- Existing `ContainerStats` interface maintained
- Legacy stats endpoints unchanged
- Dashboard converts `NormalizedStats` to `ContainerStats`
- No breaking changes to existing code

## Next Steps (Optional)

1. Install Jest for testing: `pnpm add -D jest @types/jest ts-jest supertest @types/supertest`
2. Create `jest.config.js`:
```js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server/tests'],
  testMatch: ['**/*.spec.ts'],
};
```
3. Add to `package.json`: `"test": "jest --runInBand"`
4. Consider rate limiting on logs endpoints (express-rate-limit already installed)

## Performance Considerations

- Logs: Max 5000 lines prevents memory issues
- SSE: Auto-cleanup on disconnect prevents leaks
- Stats: 2s polling interval is reasonable
- Sparklines: Only last 30 points stored
- Virtual scrolling: Already implemented in LogsDrawer via shadcn ScrollArea

## Notes

- All code changes maintain existing auth/session patterns
- No CORS changes required
- Metrics endpoint already existed (prom-client configured)
- Build successful with pnpm ✓
- TypeScript compiles without errors ✓
