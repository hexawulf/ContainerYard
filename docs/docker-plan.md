# ContainerYard v4.0.0 — Docker Image & Release Pipeline Plan

## Goal
Package ContainerYard as a multi-arch (`linux/amd64`, `linux/arm64`) Docker image published to Docker Hub (`0xwulf/containeryard`) via GitHub Actions on tag `v4.0.0`, while keeping backwards compatibility with the existing PM2 deployment until Phase C cutover.

## Step 1: Multi-Stage Dockerfile & Entrypoint
- **Base image**: `node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d` (Debian Bookworm for prebuilt `bcrypt` and Prisma Debian/OpenSSL engines).
- **`build` stage** (`--platform=$BUILDPLATFORM`):
  - `npm ci` (generates Prisma client for TypeScript compilation).
  - `npm run build` (esbuild server + Vite client + `verify-dist.sh`).
  - `vite.config.ts` supports `SOURCE_DATE_EPOCH` for reproducible `__BUILD_DATE__`.
- **`deps` stage** (target platform):
  - `npm ci --omit=dev --ignore-scripts` + `npm install --no-save --ignore-scripts prisma@6.17.1`.
  - `./node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma`.
  - Prune unused Prisma engine binaries (`fmt`, `introspection`, `migration` engines; keep `libquery_engine` and `schema-engine`) to keep uncompressed size well under 350 MB.
  - Build-time verification: `node -e "require('bcrypt')"` and `node -e "require('@prisma/client')"`.
- **`runtime` stage** (target platform):
  - Install `tini`, `openssl`, `ca-certificates` via `apt-get` (`--no-install-recommends`).
  - Copy `node_modules`, `dist/`, `server/prisma/{schema.prisma,seed.js}`, `prisma.config.ts`, `package.json`, `docker/entrypoint.sh`.
  - Create `/data` owned by `node:node` (`1000:1000`).
  - Run as `USER node` (`uid 1000`), `EXPOSE 5008`, `HEALTHCHECK` using `node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5008) + '/health')..."`.
  - OCI image labels (`title`, `description`, `source`, `url`, `licenses`, `version`, `revision`, `created`).
- **`docker/entrypoint.sh`**:
  - Validates required env vars (`SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `ALLOWED_ORIGINS`, `PIAPPS2_CADVISOR_URL`, `SYNOLOGY_CADVISOR_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) without printing values.
  - Ensures SQLite parent directory exists if `DATABASE_URL` starts with `file:`.
  - Runs `prisma db push --skip-generate --schema=server/prisma/schema.prisma` (unless `CY_SKIP_DB_PUSH=1`) and `node server/prisma/seed.js`.
  - `exec node dist/index.js`.

## Step 2: Config Refactor (Env-Driven Host Paths)
- `server/src/config/hostlogs.ts`:
  - `HOSTLOG_NGINX_DIR` (default `/var/log/nginx`)
  - `HOSTLOG_NGINX_ACCESS_FILE` (default `container.piapps.dev.access.log`)
  - `HOSTLOG_NGINX_ERROR_FILE` (default `container.piapps.dev.error.log`)
  - `PM2_LOG_DIR` (default `~/.pm2/logs`)
  - `PM2_APP_NAME` (default `containeryard-api`)
  - `HOSTLOGS_LOCAL_HOST` (default `piapps`)
- `server/src/config/hosts.ts`:
  - `piapps` socket path derived from `env.DOCKER_HOST` (stripping `unix://` prefix, default `/var/run/docker.sock`).
- Document all variables in `.env.example` and `README.md`. Add unit tests in `server/tests/unit/hostlogs.test.ts`.

## Step 3: Docker Compose & Piapps Overlay
- `docker-compose.yml`:
  - `app`: `0xwulf/containeryard:${CY_TAG:-latest}`, `build: .`, `127.0.0.1:${CY_PORT:-5008}:5008`, `cy-data:/data`, `/var/run/docker.sock:/var/run/docker.sock`, `group_add: [${DOCKER_GID:-113}, ${ADM_GID:-4}]`, `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, Watchtower opt-out label (`com.centurylinklabs.watchtower.enable=false`).
  - `redis`: `redis:7-alpine@sha256:c5d34a98396a4775e223c74e929162c35c5a2182901ba26b50ade939941ce14b`, `--requirepass ${REDIS_PASSWORD} --appendonly yes`, `cy-redis:/data`, internal network only, Watchtower opt-out label.
  - Commented optional `socket-proxy` example (`tecnativa/docker-socket-proxy`).
- `deploy/piapps/`:
  - `docker-compose.piapps.yml` (mounts `/var/log/nginx:/host/nginx:ro` and `/home/zk/.pm2/logs:/host/pm2:ro`, sets `HOSTLOG_NGINX_DIR=/host/nginx` and `PM2_LOG_DIR=/host/pm2`).
  - `.env.piapps.example` (variable names and placeholders only).

## Step 4: GitHub Actions CI & Release
- `.github/workflows/ci.yml`:
  - `test` job: Node 22, `npm ci`, `npm run check`, `npm run check:tests`, `npm run lint`, `npm test`, `npm run build`.
  - `docker` job: Build image for `linux/amd64`, start via `docker compose` with generated throwaway `.env`, wait for healthy, check `/health`, run `npm run test:integration`.
- `.github/workflows/release.yml`:
  - `tag` job: verify `v*.*.*` format and match with `package.json#version`.
  - `test` job: reusable `ci.yml` on the tag ref.
  - `publish` job: native `ubuntu-24.04` + QEMU + Buildx (or native matrix if needed), `docker/metadata-action` (`0xwulf/containeryard` tags `{{version}}`, `{{major}}.{{minor}}`, `latest`), `docker/build-push-action` (`linux/amd64,linux/arm64`, `sbom: true`, `provenance: mode=max`, GHA cache).

## Step 5: Operations Scripts
- `scripts/docker-deploy.sh`: Pull tag, inspect digest/arch/version, backup SQLite DB in `cy-data`, `docker compose up -d`, wait for healthy, verify `/health`. Supports `--dry-run`.
- `scripts/cutover-to-docker.sh`: Gated (`--dry-run` or `--i-have-approval`). Preflight, backup `app.db` + `.env` to `~/backups/containeryard/<ts>/`, stop `pm2 containeryard-api`, copy `app.db` into `cy-data`, start compose stack on `127.0.0.1:5008`, verify local + public `/health` + login probe, auto-rollback on failure.
- `scripts/rollback-to-pm2.sh`: Stop compose stack, optionally copy `app.db` back from `cy-data`, start `pm2 containeryard-api`, verify `/health`. Supports `--dry-run`.
- Mark `scripts/deploy-static.sh` as legacy PM2 deploy script.

## Step 6–7: Local Verification, PR, Merge & v4.0.0 Release
- Verify unit tests, build, image size/security, `cy-test` compose stack on `127.0.0.1:5098`, integration tests (with throwaway `cy-test-busybox` container), and Playwright E2E tests.
- Open PR, pass CI, merge to `main`, bump to `4.0.0`, push signed tag `v4.0.0`, verify multi-arch image from Docker Hub on `piapps`, and create GitHub Release.
