# Changelog

All notable changes to ContainerYard are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [5.2.0] - 2026-11-21

### Added
- Remote read-only host logs via PiDeck agents: configure an optional `logs` object (`type: "pideck-agent"`, origin-only `url`, `tokenEnv` matching `^CY_HOSTLOG_TOKEN_[A-Z0-9_]{1,32}$`, `timeoutMs` 1000–9000) on any `CY_REMOTE_HOSTS` entry.
- Server `HostLogProvider` abstraction (`LocalHostLogProvider` + `PideckAgentProvider`) with 15 s list caching, 2 MB response cap, `redirect: "error"`, strict source-ID validation (`^[a-z0-9_-]{1,64}$`), 3-strike 5-minute auth backoff, and zero leakage of tokens or remote paths.
- Local multi-app PM2 logs via `HOSTLOG_PM2_APPS` (comma-separated app names yielding `pm2_<app>_out` and `pm2_<app>_err`) and self-container logs (`cy_app`, controlled by `HOSTLOG_SELF_CONTAINER=on`, reusing the shared Docker client and log demuxer).
- Remote live tail (`?follow=1` SSE) polling every 3 s with a 20-line overlap anchor, `event: gap` markers, per-user SSE slot enforcement, ADMIN session heartbeat checks, and clean timer teardown on close.
- Snapshot reads record `hostlogs.read` audit entries and surface `X-CY-Log-Truncated` / `X-CY-Log-Redacted` headers; `/api/logs/download?scope=hostlog` routes through the same provider (remote downloads return a labelled snapshot of up to 2,000 lines).
- Host Logs UI groups sources by kind (`Files`, `journald`, `Docker`, `PM2`), adds a client-side filter box, maps agent error reasons to a single clear alert card, and shows truncation/redaction counts in the viewer footer.

### Changed
- Removed the stale `containeryard-api` default from `PM2_APP_NAME` and `deploy/hostlogs/docker-compose.hostlogs.yml`; explicit `PM2_APP_NAME` remains supported for backwards compatibility.
- Removed unused static `grafana`/`prometheus`/`freqtrade` entries and duplicate empty-state card from the Host Logs page.

### Tests
- Unit tests: 158 → 174, adding a fake PiDeck agent test harness, fake Docker engine `cy_app` coverage, SSE polling overlap/gap/timer-leak checks, and client error-reason mapping tests.

## [5.1.3] - 2026-11-20

### Added
- Favicon: the ContainerYard mark in white on the brand-blue tile, as
  `favicon.svg`, `favicon.ico` (16/32/48 px) and `apple-touch-icon.png`
  (180 px). `/favicon.ico` used to return 404.
- `scripts/generate-favicons.mjs` rebuilds the raster icons from the SVG;
  the build and the integration suite check that the icons ship and are
  served as images.

## [5.1.2] - 2026-11-20

### Removed
- Repository remnants: `docs/_archive/` (finished plans, duplicate AGENTS
  files), committed `e2e/screenshots/` test output (now ignored) and a
  committed `.claude/settings.json` with agent permissions. No application
  code changed; the image is rebuilt from the cleaned tree.

### Changed
- `.gitignore` tidied (Replit leftovers and duplicate rules removed;
  `.env.production` is an explicit exception because Vite reads it).

## [5.1.1] - 2026-11-20

### Fixed
- cAdvisor-only hosts: a cgroup v2 container without aliases (cAdvisor cannot
  see the Docker daemon) was named `system.slice/docker-<id>.scope` in the
  container list, the host summary's top lists and the inspect view. It is now
  named by its container id, like cgroup v1 containers.

### Changed
- No explicit `any` left in the app or tests, and ESLint now fails on new ones
  (`@typescript-eslint/no-explicit-any`). Errors carry an HTTP status through a
  typed `HttpError`; caught values are read with `errorInfo()` / `errorMessage()`.
- Removed the `declare module "dockerode"` shim, so the Docker client uses the
  real `@types/dockerode` types, and typed the Drizzle `db` export (it was
  `any`), so alert and metrics queries are type-checked again.
- Alert threshold comparisons moved to `relate()` (same results as before,
  tested against every operand mix).

### Tests
- Unit tests: 57 → 158, now also for the client (`client/tests/unit`).
- `docker.ts` is tested against a fake Docker Engine on a Unix socket through
  the real dockerode client (list/inspect/stats/logs/follow, every container
  action, 304/404/409 handling, EACCES/ENOENT sockets), and the container
  actions route end to end (401/403/400/404/501, audit rows, rate limit).
- cAdvisor service against a fake cAdvisor (container discovery, cgroup v1/v2
  stats, endpoint probing, 404/500/unreachable mapping without leaking the
  internal URL), notifications against a local webhook receiver, stats
  parsing, stack grouping, and the client API/CSRF retry layer.
- `npm run test:coverage` prints per-file coverage (loaded files 80 % → 90 %
  lines; `docker.ts` 55 → 98 %, `cadvisor.ts` 65 → 97 %).

## [5.1.0] - 2026-11-18

### Security
- Validate `:containerId` against `CONTAINER_REF` (`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`) across all Docker Engine socket routes (`getContainerDetail`, `getContainerStats`, `getContainerLogs`, `streamContainerLogs`, and `/inspect`) so URL-encoded path segments cannot traverse `/containers/<id>/...` on `/var/run/docker.sock`.
- Cap password inputs in `loginSchema` and `changePasswordSchema` at 1,024 characters to prevent oversized `bcrypt` hashing inputs, and generate a fresh CSRF token immediately upon login `session.regenerate`.
- Verify the `Origin` header (when present) against `allowedOrigins` in `verifyCsrf` and compare `x-metrics-token` on `/metrics` using constant-time `timingSafeEqual`.
- Enforce a per-user concurrency limit (`MAX_SSE_STREAMS_PER_USER = 6`) on live SSE log streams and re-validate `sessionVersion` and role privileges on each 15s SSE heartbeat.
- Record `outcome: "denied"` audit log entries when a non-admin attempts stack bulk actions, validate `:name` on stack routes, and validate `PATCH /api/alerts/channels/:id` and `PATCH /api/alerts/rules/:id` bodies with Zod partial schemas.
- Align Express `helmet` headers with reverse-proxy TLS termination (disable duplicate app-layer HSTS unless `CY_ENABLE_APP_HSTS=1`, set `Referrer-Policy: strict-origin-when-cross-origin`, and enable a production Content-Security-Policy) and redact internal upstream URLs and raw 500 error messages in production responses.
- Guard client-side `queryParser` regex tokens against ReDoS (rejecting patterns over 256 characters or with nested quantifiers) and pre-compile valid regexes once per query token.

### Performance
- Replace synchronous `fs.readdirSync`/`fs.statSync`/`fs.accessSync`/`fs.existsSync` in host-log routes and `hostlogs.ts` with async `fs.promises` equivalents (`newestPm2LogAsync`, `resolveHostLogsAsync`, `isReadableAsync`) and remove the duplicate `X-Content-Type-Options` header on `/api/logs/download`.
- Add a 2,000 ms in-process TTL cache with singleflight request coalescing (`statsCache`) for Docker Engine `dockerHostSummary`, `getDockerHostStats`, `getContainerStats`, and cAdvisor `hostSummary` / `getStats`, invalidated immediately on container actions.
- Cache verified session user lookups in `verifySessionUser` (`userSessionCache`, 2,000 ms TTL) with immediate invalidation on password change, role change, password reset, and user deletion.
- Parallelize `GET /api/containers` across configured hosts with `Promise.allSettled`.
- Parallelize client boot (`bootstrapRuntimeConfig()` + `checkApiHealthSafe()`), disable background polling (`refetchIntervalInBackground: false`), lazy-load `StatsChips` and `TimelineStrip`, replace `date-fns` `formatDistanceToNow` with a lightweight `formatRelativeTime` helper, memoize snapshot log lines in `LogsDrawer`, and fix `useToast` listener re-subscription.

### Changed
- Move client-only UI packages (`react`, `react-dom`, `recharts`, `lucide-react`, `@radix-ui/*`, `@tanstack/*`, `wouter`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`, `react-helmet-async`, `date-fns`) to `devDependencies` and remove unused packages (`@xterm/*`, `@radix-ui/react-toggle`, `cors`, `event-stream`, `@tailwindcss/vite`, `wait-on`, `lefthook`, `serve`, `start-server-and-test`); simplify `Dockerfile` `deps` cleanup.
- Remove 13 unreferenced client/server modules (`EnvVarsPanel`, `LogRateHeatmap`, `LogTail`, `QuerySyntaxHelper`, `QuerySyntaxReference`, `RestartComparison`, `SyntaxHighlightedInput`, `Terminal`, `toggle`, `use-mobile`, `logParser`, `queryParser`, `skipCsrf`), 3 legacy scripts, and dead exported helpers (`ensureDb`, `getHostStats`, `serveStatic`, `loadUserSafe`, `throwIfResNotOk`).
- Fix all 29 unused imports, variables, and parameters flagged by `tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- Delete 45 unreferenced screenshot PNGs from `docs/screenshots/`, archive completed plan docs and duplicate subdirectory `AGENTS.md` files under `docs/_archive/`, and point `CLAUDE.md` / `GEMINI.md` at `AGENTS.md`.

## [5.0.3] - 2026-11-12

### Security
- Container environment variables: only admins see the values. Other roles get
  the variable names with every value replaced by `[hidden]`.
- Raw `docker inspect` output (`/api/hosts/:hostId/containers/:id/inspect`) is
  admin-only on Docker hosts; it contains the environment, command line and mounts.
- cAdvisor container ids must be container cgroup paths; anything else is
  refused before a request is made, so an id can no longer reach other paths
  on the cAdvisor host.
- A session created only to hold a CSRF token (no sign-in) now expires after
  30 minutes instead of 7 days.
- Login takes the same time whether or not the e-mail exists.

### Fixed
- Requests for an unknown host id on the summary and inspect routes answer 404
  at once; they used to hang until the proxy timed out.
- A container that exits between the list and the stats call no longer turns
  the whole host summary into a 502.
- CPU % for cAdvisor hosts on cgroup v2 was close to zero (it was divided by
  CPU shares). All cAdvisor CPU figures now use one formula, as a percentage of
  one core like `docker stats`. On hosts that reported per-CPU usage the
  container detail figure was previously divided by the core count, so it reads
  higher than before and now matches the host summary.
- Live log streaming: a client that disconnects while the stream is being
  opened no longer leaks the heartbeat timer and the Docker follow stream.
- The cAdvisor inspect request has a 10 s timeout and uses the container path
  as cAdvisor expects it.

### Changed
- The user is looked up once per request instead of up to six times.
- SQLite mode: the "Historical Metrics" button is hidden (the feature needs
  PostgreSQL), and the "disabled in SQLite mode" notice is logged once per
  feature instead of on every request.

## [5.0.2] - 2026-11-10

### Changed
- Dependencies: dotenv 18 (seed script loads `.env` quietly), esbuild 0.28,
  @types/dockerode 4 (matches dockerode 5), @xterm/addon-fit 0.11 and
  @xterm/addon-web-links 0.12; GitHub Actions setup-node 7.1.0 and
  docker/login-action 4.8.0. Supersedes Dependabot PRs #14, #15, #18 and #19
  (their lockfile was not updated).
- Dependabot: Prisma packages are grouped; major React and Prisma upgrades are
  ignored until they are planned as migrations (#16 and #17 closed).

## [5.0.1] - 2026-11-10

### Fixed
- Signed-in users no longer hit "Too many requests, please try again later.":
  the global limiter now runs after the session middleware and allows 10000
  requests per 15 minutes for authenticated sessions (anonymous stays at 1000).
  An open dashboard with four hosts polls about 80 requests a minute, which
  exceeded the old shared limit of 1000.


### Security
- Weekly image refresh: every Monday the release workflow rebuilds the latest
  release without the build cache, so Debian security fixes reach the published
  image between releases. `workflow_dispatch` gains a `no_cache` option.
- Dependabot version updates for npm, the Docker base image and GitHub Actions
  (weekly, grouped); Dependabot security updates enabled.

## [5.0.0] - 2026-11-09

### Breaking
- **Generic environment-driven host configuration (`CY_LOCAL_HOST_ID`, `CY_LOCAL_HOST_NAME`, `CY_REMOTE_HOSTS`):** Removed the hard-coded host definitions and host-specific environment variables in favor of generic configuration.
  - Local Docker host: `CY_LOCAL_HOST_ID` (default `local`, matching `/^[a-z0-9-]{1,32}$/`) and `CY_LOCAL_HOST_NAME` (default `Local Docker`).
  - Remote cAdvisor-only hosts: `CY_REMOTE_HOSTS` as a JSON array of `{"id","name","cadvisorUrl","dozzleUrl"?}` entries validated with Zod on startup (unique IDs, valid URLs, empty/unset = no remote hosts).
  - Host log defaults are now neutral: `HOSTLOGS_LOCAL_HOST` defaults to `CY_LOCAL_HOST_ID`, `HOSTLOG_NGINX_ACCESS_FILE` defaults to `access.log`, `HOSTLOG_NGINX_ERROR_FILE` defaults to `error.log`, and the host-log Compose overlay lives at `deploy/hostlogs/docker-compose.hostlogs.yml`.

### Security
- **Smaller runtime attack surface:** the runtime image no longer ships npm, npx, corepack or yarn from the Node base image (the app only runs `node` and the local Prisma CLI). This removes all 22 npm-package findings that came from the bundled npm tree (Trivy: npm HIGH 11 → 0, MEDIUM 12 → 0).
- **Debian security updates at build time:** the runtime stage runs `apt-get upgrade`, so rebuilds pick up Debian fixes as they land. All remaining OS findings (bookworm: zlib, util-linux, ncurses, systemd libs, gzip, perl-base, ...) currently have no fixed Debian package.
- **`deepmerge-ts` 8.0.1 via a scoped override** under `@prisma/config` (fixes CVE-2026-40345). Prisma stays on 6.19.3; runtime `prisma db push` and seed verified.
- **zod 4 (4.6.7):** fixes GHSA-mrhx-c7xc-m3w5 (memory exhaustion when validating oversized constrained collections in zod < 4.6.6). `drizzle-zod` moves to 0.8.3, the release line that supports zod 4.

### Changed
- Validation error responses keep the same JSON shape (`issues.formErrors` / `issues.fieldErrors`, now built with `z.flattenError`). Built-in zod messages use zod 4 wording (e.g. an invalid role reads `Invalid option: expected one of "ADMIN"|"VIEWER"`); custom messages are unchanged.
- Alert channel/rule validation errors return `details: { name, issues }` explicitly (same shape as before).
- `z.record()` call sites now pass an explicit key schema; the login schema uses `z.email()`.
- New unit test: the env schema accepts a complete valid environment and rejects bad values while naming the field and never echoing the value.

## [4.2.0] - 2026-11-09

### Security
- **Require authentication for `GET /api/hosts`:** unauthenticated requests to `/api/hosts` now return `401 Unauthorized` instead of exposing the configured host inventory.
- **Omit host list from `GET /api/runtime-config`:** the public runtime configuration response no longer includes host IDs, names, or provider metadata; the dashboard loads hosts from `/api/hosts` after login.
- **Neutral demo labels:** public landing and style-guide previews use generic example host names (`edge-01`).

## [4.1.1] - 2026-11-09

### Fixed
- **cAdvisor hosts list only real containers:** an entry is kept only when its cgroup path ends in a Docker container ID (`/docker/<id>` or `docker-<id>.scope`). Remote NAS/cAdvisor hosts no longer show the parent `docker` cgroup or `system.slice/pkg-ContainerManager-dockerd.service` as containers.

## [4.1.0] - 2026-11-09

### Added
- **Optional additional remote cAdvisor host:** added support for an optional remote `CADVISOR_ONLY` host configured via environment variables (with optional Dozzle URL). The host stays hidden when the URL is unset, so existing deployments need no new env.

### Fixed
- **Dozzle links:** "Open in Dozzle" for remote containers now links to `<dozzle>/container/<12-char id>`. It used to build `<dozzle>/#/container/<cAdvisor cgroup path>`, which current Dozzle cannot resolve.

## [4.0.2] - 2026-11-09

### Fixed
- **Dashboard:** the right-column "Container overview" card no longer overflows the grid and runs through the footer when "Real-time Metrics" is shown above it. The column is now a flex stack and the card fills the remaining height (`flex-1` instead of `h-full`), so both columns end at the same line at every `lg+` width (PR #6).

## [4.0.1] - 2026-11-09

### Added
- **About modal:** Project Links now include the Docker Hub repository ([`0xwulf/containeryard`](https://hub.docker.com/repository/docker/0xwulf/containeryard/general)).

## [4.0.0] - 2026-11-09

### Added
- **Multi-arch Docker Hub image (`0xwulf/containeryard`):** Official `linux/amd64` and `linux/arm64` images built from `node:22-bookworm-slim` (pinned by digest) with `tini` as PID 1, non-root `node` user (`uid 1000`), built-in `HEALTHCHECK` against `/health`, OCI image labels, SBOM, and provenance attestations.
- **Container entrypoint (`docker/entrypoint.sh`):** Validates required environment variables without leaking secrets, prepares the SQLite `/data` directory, runs `prisma db push --skip-generate` + bootstrap admin seed on startup (skippable via `CY_SKIP_DB_PUSH=1`), and starts the server.
- **Production `docker-compose.yml` & `deploy/hostlogs/` overlay:** Bundled `redis:7-alpine` session store on an internal network, `cy-data` and `cy-redis` volumes, read-only root filesystem (`read_only: true` + `/tmp` tmpfs), `cap_drop: [ALL]`, `no-new-privileges:true`, Watchtower opt-out labels (`com.centurylinklabs.watchtower.enable=false`), and optional read-only host-log bind mounts (`/host/nginx`, `/host/pm2`).
- **Environment-driven host log & socket paths:** `HOSTLOG_NGINX_DIR`, `HOSTLOG_NGINX_ACCESS_FILE`, `HOSTLOG_NGINX_ERROR_FILE`, `PM2_LOG_DIR`, `PM2_APP_NAME`, `HOSTLOGS_LOCAL_HOST`, and `DOCKER_HOST` socket path resolution with graceful degradation when log files or directories are absent.
- **GitHub Actions CI & Release pipelines (`.github/workflows/ci.yml`, `release.yml`):** Automated typecheck, ESLint, unit tests, production build, Docker Compose + Redis integration suite on every PR/push, and tag-verified multi-arch Docker Hub publishing on `v*.*.*` tags.
- **Operations & deploy scripts:** `scripts/docker-deploy.sh` for pulling tagged releases, backing up the `cy-data` SQLite database volume, recreating the container, and verifying `/health`.
- **Reproducible build dates:** `vite.config.ts` respects `SOURCE_DATE_EPOCH` when injecting `__BUILD_DATE__`.

### Included from 3.2 (PR #3 & PR #4)
- **Unified top-right header action bar (`Navbar`):** `[Open Dashboard] · (i) About · Theme · Change password · Users (ADMIN) · Logout` in exact left-to-right order across all routes.
- **About modal (`AboutModal`):** Build version (`v{__APP_VERSION__}`) and date (`__BUILD_DATE__`), runtime user/role badge, grouped tech stack, developer contact (`0xWulf`, `mailto:dev@0xwulf.dev`), project/docs links, and one-click copyable diagnostics string.
- **Self-service password change (`ChangePasswordModal` & `POST /api/auth/change-password`):** Enforces 12–72 UTF-8 bytes (`Buffer.byteLength`), hashes with `bcrypt` cost 12, increments `User.sessionVersion`, and regenerates the caller's session to revoke all other sessions for that user.
- **ADMIN user management (`UsersModal` & `/api/users`):** List users, create accounts with CSPRNG password generator, switch `ADMIN`/`VIEWER` roles, reset passwords, and delete users with cascading `LogBookmark`/`SavedSearch` cleanup and self/last-admin protection guards (`403`/`409`).
- **Light-by-default theme system (`containeryard-theme`):** Persistent light/dark toggle on every page with zero-flash inline initialization and WCAG AA contrast tokens.
