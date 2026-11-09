#!/usr/bin/env bash
# Author: 0xWulf (zk@hexawulf.dev)
# Description: Phase C production cutover from PM2 (`containeryard-api`) to
#              Docker Compose (`0xwulf/containeryard`) on piapps (127.0.0.1:5008).
#              Refuses to execute without `--dry-run` unless `--i-have-approval`
#              is explicitly passed.
#              Usage: scripts/cutover-to-docker.sh [--dry-run] [--i-have-approval] [--tag X.Y.Z]
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
TAG="${CY_TAG:-4.0.0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --i-have-approval)
      APPROVED=1
      shift
      ;;
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--i-have-approval] [--tag X.Y.Z]"
      exit 0
      ;;
    *)
      echo -e "${C_ERR}Unknown argument: $1${C_RESET}" >&2
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" -eq 0 ] && [ "$APPROVED" -eq 0 ]; then
  echo -e "${C_ERR}BLOCKED: Phase C cutover touches live production (pm2 containeryard-api on :5008).${C_RESET}" >&2
  echo -e "${C_WARN}Run with --dry-run to preview, or pass --i-have-approval to execute the cutover.${C_RESET}" >&2
  exit 1
fi

mkdir -p "$HOME/logs"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$HOME/logs/containeryard-cutover-${TS}.log"
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

err() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*"
  echo -e "${C_ERR}${msg}${C_RESET}" >&2
  echo "$msg" >>"$LOG"
  exit 1
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

IMAGE="0xwulf/containeryard:${TAG}"
PROJECT="${CY_COMPOSE_PROJECT:-containeryard}"
PROD_DIR="${CY_PROD_DIR:-/home/zk/projects/ContainerYard}"
PROD_DB="${PROD_DIR}/server/prisma/app.db"
PROD_ENV="${PROD_DIR}/.env"
BACKUP_DIR="$HOME/backups/containeryard/${TS}"
COMPOSE_FILES=(-f docker-compose.yml -f deploy/piapps/docker-compose.piapps.yml)

log "=== ContainerYard Phase C Cutover (PM2 -> Docker) ==="
log "Mode: $([ "$DRY_RUN" -eq 1 ] && echo "DRY-RUN" || echo "LIVE EXECUTION")"
log "Log file: ${LOG}"
log "Target image: ${IMAGE}"
log "Compose project: ${PROJECT}"

# Bind-address change notice
warn "BIND CHANGE NOTICE: PM2 currently listens on 0.0.0.0:5008; Docker binds 127.0.0.1:5008."
warn "Audit of 192.168.50.102:5008 / :5008 callers:"
warn "  - /etc/nginx/sites-enabled/container.piapps.dev -> proxies to 127.0.0.1:5008 (compatible)"
warn "  - /home/zk/bin/pideck-port-audit.sh & collect-cf522.sh -> check 127.0.0.1:5008 (compatible)"
warn "  - No external LAN callers to 192.168.50.102:5008 found in repo, ~/bin, or vault."

# 1. Preflight checks
log "Step 1: Preflight checks..."
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  ok "Image ${IMAGE} is present locally ($(docker image inspect -f '{{.Architecture}}' "$IMAGE"))"
else
  if [ "$DRY_RUN" -eq 1 ]; then
    warn "Image ${IMAGE} not pulled yet; during live cutover 'docker pull ${IMAGE}' will run first."
  else
    log "Pulling ${IMAGE}..."
    docker pull "$IMAGE" >>"$LOG" 2>&1
  fi
fi

# Validate compose configuration using a temporary dummyREDIS_PASSWORD if not in env
(
  export REDIS_PASSWORD="${REDIS_PASSWORD:-dryrunplaceholder}"
  export CY_ENV_FILE="${PROD_ENV}"
  export CY_TAG="${TAG}"
  docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" config -q
)
ok "Docker Compose configuration is valid"

if [ -f "$PROD_DB" ]; then
  ok "Production SQLite database found at ${PROD_DB} ($(stat -c '%s' "$PROD_DB") bytes)"
else
  err "Production SQLite database not found at ${PROD_DB}"
fi

if [ -f "$PROD_ENV" ]; then
  ok "Production .env found at ${PROD_ENV}"
  if ! grep -q '^REDIS_PASSWORD=' "$PROD_ENV"; then
    warn "${PROD_ENV} does not yet contain REDIS_PASSWORD=... (add a strong REDIS_PASSWORD before live cutover)"
  fi
else
  err "Production .env not found at ${PROD_ENV}"
fi

PM2_STATUS="$(pm2 jlist | jq -r '.[] | select(.name=="containeryard-api") | .pm2_env.status' || true)"
if [ "$PM2_STATUS" = "online" ]; then
  ok "PM2 app containeryard-api is currently online on :5008"
else
  warn "PM2 app containeryard-api status is '${PM2_STATUS:-missing}'"
fi

FREE_KB="$(df -k --output=avail "$PWD" | tail -n 1 | tr -d ' ')"
if [ "${FREE_KB:-0}" -lt 1048576 ]; then
  err "Insufficient free disk space (< 1 GB available)"
fi
ok "Disk space check passed ($((FREE_KB / 1024)) MB available)"

# 2. Back up app.db and .env
log "Step 2: Backing up ${PROD_DB} and ${PROD_ENV} to ${BACKUP_DIR}/..."
run mkdir -p "$BACKUP_DIR"
run cp -a "$PROD_DB" "${BACKUP_DIR}/app.db"
run cp -a "$PROD_ENV" "${BACKUP_DIR}/.env"
run chmod 600 "${BACKUP_DIR}/.env"

# 3. Stop PM2 containeryard-api
log "Step 3: Stopping PM2 containeryard-api..."
run pm2 stop containeryard-api

rollback_on_failure() {
  echo -e "${C_ERR}[cutover] Cutover failed! Executing automatic rollback to PM2...${C_RESET}" >&2
  docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" down >>"$LOG" 2>&1 || true
  pm2 start containeryard-api >>"$LOG" 2>&1 || true
  exit 1
}

if [ "$DRY_RUN" -eq 0 ]; then
  trap rollback_on_failure ERR
fi

# 4. Copy app.db into the cy-data volume
DATA_VOL="${PROJECT}_cy-data"
log "Step 4: Copying ${BACKUP_DIR}/app.db into Docker volume ${DATA_VOL}..."
run docker volume create "$DATA_VOL"
run docker run --rm \
  -v "${DATA_VOL}:/data" \
  -v "${BACKUP_DIR}:/backup:ro" \
  --entrypoint /bin/sh \
  "$IMAGE" -c "cp -a /backup/app.db /data/app.db && chown 1000:1000 /data/app.db"

# 5. Start Docker Compose on 127.0.0.1:5008 and run health checks
log "Step 5: Starting Docker Compose stack (${PROJECT}) on 127.0.0.1:5008..."
export CY_TAG="$TAG"
export CY_BIND="127.0.0.1"
export CY_PORT="5008"
export CY_ENV_FILE="$PROD_ENV"
if [ "$DRY_RUN" -eq 0 ]; then
  # Load REDIS_PASSWORD from PROD_ENV without echoing
  set -a
  # shellcheck disable=SC1090
  source "$PROD_ENV"
  set +a
fi

run docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" up -d --no-build

if [ "$DRY_RUN" -eq 0 ]; then
  APP_CID="$(docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" ps -q app)"
  log "Waiting for container ${APP_CID} to become healthy..."
  for i in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$APP_CID" 2>/dev/null || echo starting)"
    if [ "$status" = "healthy" ]; then
      ok "Container ${APP_CID} is healthy"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "Container failed to become healthy" >&2
      false
    fi
    sleep 2
  done

  log "Checking local health endpoint http://127.0.0.1:5008/health..."
  curl -fsS http://127.0.0.1:5008/health >/dev/null
  ok "Local /health returned 200 OK"

  log "Checking public health endpoint https://containeryard.org/health..."
  curl -fsS https://containeryard.org/health >/dev/null
  ok "Public https://containeryard.org/health returned 200 OK"

  log "Checking CSRF + session probe with X-Forwarded-Proto: https..."
  CSRF_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' http://127.0.0.1:5008/api/auth/csrf)"
  if [ "$CSRF_STATUS" != "200" ]; then
    echo "CSRF probe failed with HTTP ${CSRF_STATUS}" >&2
    false
  fi
  ok "CSRF session probe on 127.0.0.1:5008 returned HTTP 200"

  trap - ERR
  ok "Cutover succeeded!"
  echo ""
  echo "After verifying the dashboard in your browser, finalize PM2 removal by running:"
  echo "  pm2 delete containeryard-api && pm2 save"
else
  log "Step 5 (probes): [dry-run] curl -fsS http://127.0.0.1:5008/health"
  log "Step 5 (probes): [dry-run] curl -fsS https://containeryard.org/health"
  log "Step 5 (probes): [dry-run] curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:5008/api/auth/csrf"
  ok "Dry-run complete. Live PM2 process containeryard-api was NOT touched."
  echo "When ready for Phase C cutover, run:"
  echo "  scripts/cutover-to-docker.sh --i-have-approval --tag ${TAG}"
fi
