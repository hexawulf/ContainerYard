# ContainerYard API Reference

All `/api/*` endpoints (except `/health` and `/api/auth/login`) require an authenticated session cookie. Mutating requests (`POST`, `PATCH`, `DELETE`) also require the `x-csrf-token` header.

---

## Container Logs

### `GET /api/hosts/:hostId/containers/:containerId/logs`

Fetch historical container logs (Docker hosts) or a Dozzle deep link (cAdvisor-only hosts).

**Query parameters:**
- `tail` — Number of lines (default: `500`, max: `5000`)
- `since` — ISO-8601 timestamp or Unix seconds
- `grep` — Search pattern (safely escaped)
- `stdout` — Include stdout (default: `true`)
- `stderr` — Include stderr (default: `true`)

**Response (Docker host):**
```json
{
  "content": "log content",
  "truncated": false
}
```

**Response (cAdvisor-only host with Dozzle configured):**
```json
{
  "link": "https://dozzle.example.internal/container/:id"
}
```

### `GET /api/hosts/:hostId/containers/:containerId/logs/stream`

Server-Sent Events (SSE) endpoint for real-time log streaming (Docker hosts only).

- **Query parameters:** `stdout`, `stderr`, `grep`
- **Events:** `event: line` (log payload), `:heartbeat` (keep-alive every 15s)

---

## Container Stats & Stacks

### `GET /api/hosts/:hostId/containers/:containerId/stats`

Returns normalized container resource telemetry:
```json
{
  "cpuPct": 12.5,
  "memPct": 45.2,
  "memBytes": 536870912,
  "blkRead": 1024000,
  "blkWrite": 512000,
  "netRx": 2048000,
  "netTx": 1024000,
  "ts": "2026-01-01T12:00:00.000Z"
}
```

### `GET /api/hosts/:hostId/stacks`

Lists Docker Compose stacks (grouped by `com.docker.compose.project`) with health indicators (`healthy`, `unhealthy`, `partial`, `unknown`) plus `standaloneContainers`.

### `GET /api/hosts/:hostId/stacks/:name`

Returns detailed container list and aggregated metrics for a single stack.

### `POST /api/hosts/:hostId/stacks/:name/action`

`ADMIN` only, CSRF-protected, audited. Body: `{ "action": "start" | "stop" | "restart" | "remove" }`.

---

## Container Lifecycle Actions

### `POST /api/hosts/:hostId/containers/:containerId/actions`

`ADMIN` only, CSRF-protected, rate-limited (30/min), audited. `containerId` may be a container ID or name.

- **Body:** `{ "action": "start" | "stop" | "restart" | "pause" | "unpause" | "remove" }`
- **Response:** `{ "success": true, "action": "pause", "id": "a3fd…", "name": "web", "state": "paused", "noop": false }`
- **Status codes:** `400` invalid action/ref · `403` not `ADMIN` or bad CSRF token · `404` unknown container · `409` state conflict · `501` read-only cAdvisor host.

---

## Audit Log

### `GET /api/audit?limit=100&before=<id>&action=container.`

`ADMIN` only. Cursor-paginated (`nextBefore`), newest first. Records `action` (`container.*`, `stack.*`, `auth.*`, `user.*`), `outcome` (`success` | `failure` | `denied`), `userEmail`, `hostId`, `target`, `detail`, `ip`, and `createdAt`.

---

## Authentication & User Management

- `POST /api/auth/change-password` — Signed-in users (`12`–`72` UTF-8 bytes, bcrypt cost 12). Increments `sessionVersion` and regenerates caller session to revoke all other sessions.
- `GET /api/users` — `ADMIN` only. Lists `[{ id, email, role, createdAt, updatedAt }]`.
- `POST /api/users` — `ADMIN` only, CSRF-protected. Body: `{ "email", "role": "ADMIN" | "VIEWER", "password" }` → `201` (`409` on duplicate).
- `PATCH /api/users/:id` — `ADMIN` only, CSRF-protected. Updates `role`, bumps `sessionVersion`; blocks self-demotion (`403`) and demoting the last `ADMIN` (`409`).
- `POST /api/users/:id/reset-password` — `ADMIN` only, CSRF-protected. Resets password and bumps `sessionVersion`.
- `DELETE /api/users/:id` — `ADMIN` only, CSRF-protected. Transactional delete of user + bookmarks + saved searches; blocks self-deletion (`403`) and deleting the last `ADMIN` (`409`).

---

## Bookmarks & Saved Searches

- `GET /api/bookmarks[?containerId=…]` · `POST /api/bookmarks` `{ containerId, timestamp, note?, filters? }` · `DELETE /api/bookmarks/:id`
- `GET /api/saved-searches` · `POST /api/saved-searches` · `DELETE /api/saved-searches/:id`

---

## Alerts & Historical Metrics

- **Notification Channels:** `GET/POST /api/alerts/channels`, `PATCH/DELETE /api/alerts/channels/:id`, `POST /api/alerts/channels/:id/test`
- **Alert Rules:** `GET/POST /api/alerts/rules`, `PATCH/DELETE /api/alerts/rules/:id`
- **Alert History:** `GET /api/alerts/history?limit=100`, `POST /api/alerts/history/:id/acknowledge`
- **Historical Metrics:**
  - `GET /api/hosts/:hostId/containers/:containerId/metrics/history?days=7`
  - `GET /api/hosts/:hostId/metrics/summary?days=7`
  - `GET /api/hosts/:hostId/metrics/top-cpu?limit=5`
  - `GET /api/hosts/:hostId/metrics/top-memory?limit=5`

---

## Prometheus Metrics & Health

- `GET /health` — Lightweight liveness check used by Docker `HEALTHCHECK`.
- `GET /metrics` — Prometheus process & HTTP duration metrics (optional `x-metrics-token` auth via `METRICS_TOKEN`).
