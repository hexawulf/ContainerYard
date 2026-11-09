#!/usr/bin/env bash
# Author: 0xWulf <dev@0xwulf.dev>
# Description: ContainerYard Docker entrypoint — validates required env vars,
#              prepares SQLite directory, runs Prisma schema push + bootstrap
#              admin seed, and execs the production server.
# Created: 2026-11-09
# Modified: 2026-11-09
set -euo pipefail

fail() {
  echo "[containeryard-entrypoint] ERROR: $*" >&2
  exit 1
}

# Verify required environment variables without ever echoing their values.
required_vars=(
  SESSION_SECRET
  DATABASE_URL
  REDIS_URL
  ALLOWED_ORIGINS
  ADMIN_EMAIL
  ADMIN_PASSWORD
)

missing=()
for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  fail "Missing required environment variable(s): ${missing[*]}. See .env.example."
fi

if [ "${#SESSION_SECRET}" -lt 32 ]; then
  fail "SESSION_SECRET must be at least 32 characters long."
fi

if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
  fail "ADMIN_PASSWORD must be at least 12 characters long."
fi

# Ensure parent directory exists when using SQLite (DATABASE_URL=file:/path/to/app.db)
if [[ "${DATABASE_URL}" == file:* ]]; then
  db_path="${DATABASE_URL#file:}"
  # Strip optional query parameters (e.g. ?connection_limit=1)
  db_path="${db_path%%\?*}"
  db_dir="$(dirname "${db_path}")"
  mkdir -p "${db_dir}"
fi

# Synchronize Prisma schema and seed initial admin user (unless skipped)
if [ "${CY_SKIP_DB_PUSH:-0}" != "1" ]; then
  echo "[containeryard-entrypoint] Syncing database schema (prisma db push)..."
  ./node_modules/.bin/prisma db push --skip-generate --schema=server/prisma/schema.prisma
  echo "[containeryard-entrypoint] Running bootstrap admin seed..."
  node server/prisma/seed.js
else
  echo "[containeryard-entrypoint] CY_SKIP_DB_PUSH=1 set; skipping prisma db push and seed."
fi

echo "[containeryard-entrypoint] Starting ContainerYard on port ${PORT:-5008}..."
exec node dist/index.js
