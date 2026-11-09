#!/usr/bin/env bash
# Author: 0xWulf
# Description: [LEGACY — PM2 install] Build and (re)deploy ContainerYard under PM2.
#              For Docker deployments (v4.0+), use scripts/docker-deploy.sh instead.
#              Usage: scripts/deploy-static.sh [--dry-run]
# Modified: 2026-11-09 (marked legacy for v4.0 Docker release; still functional for PM2)
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$HOME/logs"
LOG="$HOME/logs/containeryard-deploy-$(date +%Y%m%d-%H%M%S).log"
echo "Logging to $LOG"
# Runs a step (output appended to $LOG), or only prints it with --dry-run.
run() { if [ "$DRY_RUN" -eq 1 ]; then echo "[dry-run] $*"; else "$@" >>"$LOG" 2>&1; fi; }

DB="$(pwd)/server/prisma/app.db"
if [ -f "$DB" ]; then
  run cp -a "$DB" "$(pwd)/../.containeryard-app.db.bak-$(date +%Y%m%d-%H%M%S)"
fi

run npm ci
run npm run db:push:prisma
run npm run build
run pm2 startOrReload ecosystem.config.cjs
run pm2 save

if [ "$DRY_RUN" -eq 0 ]; then
  sleep 5
  pm2 status containeryard-api
  curl -fsS http://127.0.0.1:5008/health && echo
fi
