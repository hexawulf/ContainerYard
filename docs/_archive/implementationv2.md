# ContainerYard Implementation v2 (Concise • DeepSeek‑ready)

> Purpose: turn `implementation.md` into an execute‑ready plan with security fixes (CSRF, rate‑limits), single alert worker, safe log retrieval, and webhook hardening. Keep prompts minimal; each step is atomic and verifiable.

## 0) High‑level
- **Stacks**: Node/Express, Prisma(Postgres), React/Vite, PM2, Nginx/CF.
- **Features**: Container actions, Log Bookmarks + Deep‑links, Log Pattern Alerts.
- **Non‑negotiables**: CSRF for all mutations; input validation (zod); audit log; rate limits; safe log I/O.

---

## 1) Security & App Hardening
- Trust proxy (CF/Nginx): `app.set('trust proxy', true)`.
- **CSRF** (double‑submit cookie):
  - On `/api/auth/me`: issue `csrf` token (httpOnly **false**, SameSite=Lax) + return `{csrf}` in body.
  - Middleware: require `x-csrf-token` on `POST|PATCH|DELETE` and match cookie value.
  - Client: attach `credentials: "include"` and `headers: {'x-csrf-token': token}`.
- **Rate limits** (per IP + user): `/api/actions/*` and `/api/alerts/*` (e.g., 30/min IP, 10/min user).
- **Validation**: zod DTOs → request bodies; refuse on parse errors.
- **Audit**: capture `user_id, action, target, status, ip, ua, ts`.
- **CORS**: origin allowlist (container.piapps.dev only).

---

## 2) DB Model Deltas (Prisma)
```prisma
model LogBookmark {
  id           String   @id @default(cuid())
  userId       String   @index
  containerId  String   @index
  label        String
  ts           DateTime @index(map: "bm_container_ts")
  createdAt    DateTime @default(now())
  @@index([containerId, ts], name: "container_ts")
}

model Alert {
  id           String   @id @default(cuid())
  userId       String   @index
  containerId  String   @index
  pattern      String   // regex string (server‑validated, anchored if needed)
  windowSec    Int      // evaluate logs from now - windowSec
  threshold    Int      // min matches to trigger
  cooldownSec  Int      @default(300)
  enabled      Boolean  @default(true) @index
  webhookUrl   String?
  secret       String?  // HMAC signer
  lastFiredAt  DateTime?
  createdAt    DateTime @default(now())
}
```
Add indices: `Alert(userId, enabled)`, `LogBookmark(containerId, ts)`.

---

## 3) API Contracts (minimal)
- `POST /api/actions/:id/(start|stop|restart|pause|unpause|remove)`  
  Body: `{ force?: boolean }` → `200 {ok:true}`; RBAC: ADMIN only; audit.
- `GET /api/containers/:id/bookmarks` → `200 LogBookmark[]`
- `POST /api/containers/:id/bookmarks` Body: `{label:string, ts:number}`
- `GET /api/bookmarks/:id/deeplink` → `302 /logs?container=:id#t=:ts` (or signed URL, 24h) 
- `GET /api/containers/:id/logs/stream` (SSE) Query: `since, follow=true, tail<=5000`
- `POST /api/alerts` Body: `{containerId, pattern, windowSec, threshold, cooldownSec?, webhookUrl?}`
- `PATCH /api/alerts/:id` `{enabled?:boolean, ...}`
- `GET /api/alerts` → user‑scoped list
- `POST /api/webhooks/test` `{alertId}` → sends signed test event

All mutation routes: **CSRF + rate‑limit + zod**.

---

## 4) Log Retrieval (safe & bounded)
- Implement `getContainerLogs(opts)` in `server/src/docker.ts`:
  - Source: **prefer** Docker Engine API via `dockerode.modem.dial` or `docker logs --since` via `child_process.spawn`.
  - Bounds: `--since <iso>`, `--tail <N>`; cap bytes (e.g., 5 MB) and **truncate** with notice.
  - Pattern: compile safe `RegExp` (timeout via line‑by‑line test; no user flags like `m`/`s` unless whitelisted).
  - SSE: stream lines; on client, use virtualized list + backpressure.
- Deny patterns that look catastrophic (e.g., catastrophic backtracking) via a basic heuristic or RE2 wrapper if available.

---

## 5) Alerts Worker (single instance)
- New entry: `server/src/worker/alerts.ts`
- Locking strategy (pick one):
  1) **PM2 single**: run as dedicated process `pm2 start npm --name cy-alerts -- run alerts` (instances: 1)
  2) **Redis + BullMQ**: repeatable job `"alerts:eval"` every 30s with queue‑level concurrency 1.
- Eval loop (pseudo):
  1. Load `enabled` alerts.
  2. For each: read logs `[now-windowSec, now]` with cap; count matches.
  3. If `count >= threshold` and `now - lastFiredAt >= cooldownSec`: fire.
  4. Update `lastFiredAt` and write audit.
- Webhook send:
  - Headers: `X-CY-Alert-Id`, `X-CY-Signature: sha256=<hex>` where HMAC over body using `alert.secret` or per‑user secret.
  - Retries: 3 with 2^n backoff; DLQ table on permanent failure.
  - SSRF defense: block RFC1918, loopback, link‑local, `.local`, IPv6 ULA. Resolve DNS first, then check IPs.

---

## 6) Client Work (React)
- Global: fetch `csrf` from `/api/auth/me`; store in `AuthStore`; attach header.
- **LogsViewer**: SSE endpoint, tail control (max 5000), jump to bookmark by timestamp anchor.
- **Bookmarks UI**: sidebar + create at current cursor time; optimistic update with rollback.
- **Alerts UI**: form with live regex preview (client‑side only for UX), cooldown selector, toggle enable, webhooks test button.
- **Confirmations**: destructive ops require modal; `remove` blocked if container is running unless `force=true` checkbox.
- **Toasts**: success/failure; include audit id on success.

---

## 7) Limits & Defaults
- Tail max = 5000 lines; bytes cap per request = 5 MB.
- Max alerts per user = 100 (enforce at API + UI).
- Rate limit actions: 10/min per user; alerts CRUD: 30/min per IP.
- Regex length ≤ 512 chars; windowSec ≤ 86400; threshold ≤ 10_000.

---

## 8) Testing
- **Unit**: mock Dockerode; validate zod DTOs; CSRF middleware happy/sad.
- **E2E (Playwright)**:
  1) Login → `/api/auth/me` returns `csrf`.
  2) Start/stop/restart a test container → audit row exists.
  3) Create bookmark → open deep‑link → log scroller focuses timestamp.
  4) Create alert with known pattern → emit webhook to test server → signature verifies.
  5) Rate‑limit and CSRF negative tests.
- **Load smoke**: run multiple SSE clients; ensure server stays ≤ expected CPU/RAM.

---

## 9) Deployment
- PM2:
  - `cy-api` (instances: max 2), `cy-web` (vite preview/build), `cy-alerts` (instances: 1).
- Nginx/CF: ensure sticky cookies, gzip for SSE disabled, proper `X-Forwarded-*`.
- Feature flag: `ALERTS_ENABLED` to admins first.

---

## 10) Step‑by‑Step Execution (DeepSeek prompts)
1. **Add CSRF + zod** middleware; update all mutations; add trust proxy.
2. **Prisma migrate** with models above; add composite indices.
3. **Implement docker log util + SSE** with caps; wire GET `/logs/stream`.
4. **Container actions** routes + audit + rate limit.
5. **Bookmarks** routes + UI + deep‑link redirect.
6. **Alert worker** + webhook signer + SSRF guard; UI to manage alerts.
7. **Tests** (unit + e2e) and basic load smoke.
8. **PM2/Nginx** changes; enable feature flag; rollout to admins, then all.

---

## 11) Acceptance Criteria (must pass)
- All mutations require valid CSRF and pass zod validation.
- Single alert evaluator running; no duplicate firings in logs.
- Log viewer never exceeds caps; UI remains responsive with 5k‑line tails.
- Webhook recipients can verify HMAC; SSRF blocked (tests cover private IPs).
- e2e suite green; basic load smoke within CPU/RAM budget.
