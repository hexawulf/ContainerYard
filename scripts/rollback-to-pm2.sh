#!/usr/bin/env bash
# Author: 0xWulf (zk@hexawulf.dev)
# Description: Roll back ContainerYard on piapps from Docker Compose to the
#              PM2 `containeryard-api` process, optionally syncing app.db back
#              from the `cy-data` volume first.
#              Usage: scripts/rollback-to-pm2.sh [--dry-run] [--i-have-approval] [--sync-db]
# Created: 2026-11-09
# Modified: 2026-11-09
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -t 1 ]; then
  C_RESET="\033[0m"
  C_INFO="\033[1;34m"
  C_OK="\033[1;32m"
  C_WARN="\033[1;33m"
  C_ERR="\033[1;31m"
else
  C_RESET=""
  C_INFO=""
  C_OK=""
  C_WARN=""
  C_ERR=""
fi

DRY_RUN=0
APPROVED=0
SYNC_DB=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    --i-have-approval)
      APPROVED=1
      ;;
    --sync-db)
      SYNC_DB=1
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--i-have-approval] [--sync-db]"
      exit 0
      ;;
    *)
      echo -e "${C_ERR}Unknown argument: $arg${C_RESET}" >&2
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" -eq 0 ] && [ "$APPROVED" -eq 0 ]; then
  echo -e "${C_ERR}BLOCKED: Rollback modifies live production on :5008.${C_RESET}" >&2
  echo -e "${C_WARN}Run with --dry-run to preview, or pass --i-have-approval to execute.${C_RESET}" >&2
  exit 1
fi

mkdir -p "$HOME/logs"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$HOME/logs/containeryard-rollback-${TS}.log"
touch "$LOG"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo -e "${C_INFO}${msg}${C_RESET}"
  echo "$msg" >>"$LOG"
}

ok() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] OK: $*"
  echo -e "${C_OK}${msg}${C_RESET}"
  echo "$msg" >>"$LOG"
}

warn() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*"
  echo -e "${C_WARN}${msg}${C_RESET}"
  echo "$msg" >>"$LOG"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo -e "${C_WARN}[dry-run] $*${C_RESET}"
    echo "[dry-run] $*" >>"$LOG"
  else
    log "Running: $*"
    "$@" >>"$LOG" 2>&1
  fi
}

PROJECT="${CY_COMPOSE_PROJECT:-containeryard}"
PROD_DIR="${CY_PROD_DIR:-/home/zk/projects/ContainerYard}"
PROD_DB="${PROD_DIR}/server/prisma/app.db"
DATA_VOL="${PROJECT}_cy-data"
COMPOSE_FILES=(-f docker-compose.yml -f deploy/piapps/docker-compose.piapps.yml)

log "=== ContainerYard Rollback (Docker -> PM2) ==="
log "Mode: $([ "$DRY_RUN" -eq 1 ] && echo "DRY-RUN" || echo "LIVE EXECUTION")"
log "Log file: ${LOG}"

if [ "$SYNC_DB" -eq 1 ]; then
  log "Step 1: Syncing app.db from Docker volume ${DATA_VOL} back to ${PROD_DB}..."
  run cp -a "$PROD_DB" "${PROD_DB}.pre-rollback-${TS}"
  run docker run --rm \
    -v "${DATA_VOL}:/data:ro" \
    -v "$(dirname "$PROD_DB"):/hostdb" \
    --entrypoint /bin/cp \
    0xwulf/containeryard:latest -a /data/app.db /hostdb/app.db
else
  log "Step 1: Skipping DB copy from volume (pass --sync-db to copy cy-data/app.db back to host)."
fi

log "Step 2: Stopping Docker Compose stack (${PROJECT})..."
run docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" down

log "Step 3: Starting PM2 containeryard-api..."
run pm2 startOrReload "${PROD_DIR}/ecosystem.config.cjs"
run pm2 save

if [ "$DRY_RUN" -eq 0 ]; then
  sleep 3
  pm2 status containeryard-api
  curl -fsS http://127.0.0.1:5008/health && echo
  ok "Rollback to PM2 complete and healthy on :5008"
else
  log "Step 4: [dry-run] curl -fsS http://127.0.0.1:5008/health"
  ok "Dry-run complete. No changes made."
fi
