# Changelog

All notable changes to ContainerYard are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

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
