#!/usr/bin/env bash
# Author: 0xWulf <dev@0xwulf.dev>
# Description: Pull and deploy a tagged 0xwulf/containeryard Docker image,
#              backing up the SQLite database in cy-data beforehand.
#              Usage: scripts/docker-deploy.sh <X.Y.Z> [--dry-run]
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

TAG=""
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      echo "Usage: $0 <X.Y.Z> [--dry-run]"
      exit 0
      ;;
    -*)
      echo -e "${C_ERR}Unknown option: $arg${C_RESET}" >&2
      exit 1
      ;;
    *)
      if [ -z "$TAG" ]; then
        TAG="${arg#v}"
      else
        echo -e "${C_ERR}Unexpected argument: $arg${C_RESET}" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$TAG" ]; then
  echo -e "${C_ERR}Usage: $0 <X.Y.Z> [--dry-run]${C_RESET}" >&2
  exit 1
fi

mkdir -p "$HOME/logs"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$HOME/logs/containeryard-docker-deploy-${TS}.log"
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
PORT="${CY_PORT:-5008}"
COMPOSE_FILES=(-f docker-compose.yml)
if [ -f deploy/hostlogs/docker-compose.hostlogs.yml ] && [ "${CY_USE_HOSTLOGS_OVERRIDE:-1}" = "1" ]; then
  COMPOSE_FILES+=(-f deploy/hostlogs/docker-compose.hostlogs.yml)
fi

log "ContainerYard Docker deploy starting (tag=${TAG}, project=${PROJECT}, dry_run=${DRY_RUN})"
log "Log file: ${LOG}"

# 1. Pull image and inspect digest / arch / version label
run docker pull "$IMAGE"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  DIGEST="$(docker image inspect -f '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || echo "local")"
  ARCH="$(docker image inspect -f '{{.Architecture}}' "$IMAGE")"
  VER_LABEL="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$IMAGE")"
  REV_LABEL="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")"
  log "Image metadata: digest=${DIGEST} arch=${ARCH} version=${VER_LABEL} revision=${REV_LABEL}"
else
  warn "Image ${IMAGE} not present locally yet (expected in --dry-run before pull)."
fi

# 2. Back up the cy-data SQLite database volume if it exists
DATA_VOL="${PROJECT}_cy-data"
BACKUP_DIR="$HOME/backups/containeryard"
run mkdir -p "$BACKUP_DIR"

if docker volume inspect "$DATA_VOL" >/dev/null 2>&1; then
  BACKUP_FILE="${BACKUP_DIR}/app.db.bak-${TS}"
  log "Backing up SQLite database from volume ${DATA_VOL} to ${BACKUP_FILE}..."
  run docker run --rm \
    -v "${DATA_VOL}:/data:ro" \
    -v "${BACKUP_DIR}:/backup" \
    --entrypoint /bin/cp \
    "$IMAGE" -a /data/app.db "/backup/app.db.bak-${TS}"
else
  warn "Volume ${DATA_VOL} does not exist yet; skipping volume DB backup."
fi

# 3. Bring up the Compose stack with the requested tag
export CY_TAG="$TAG"
run docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" up -d --no-build --remove-orphans

# 4. Wait for healthy and verify /health
if [ "$DRY_RUN" -eq 0 ]; then
  APP_CID="$(docker compose -p "$PROJECT" "${COMPOSE_FILES[@]}" ps -q app)"
  [ -n "$APP_CID" ] || err "Could not determine app container ID for project ${PROJECT}"

  log "Waiting for container ${APP_CID} to report healthy..."
  for i in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$APP_CID" 2>/dev/null || echo starting)"
    if [ "$status" = "healthy" ]; then
      ok "Container ${APP_CID} is healthy"
      break
    fi
    if [ "$i" -eq 30 ]; then
      err "Container ${APP_CID} failed to become healthy within 60s (status=${status})"
    fi
    sleep 2
  done

  HEALTH_JSON="$(curl -fsS "http://127.0.0.1:${PORT}/health")"
  ok "Health check passed on http://127.0.0.1:${PORT}/health -> ${HEALTH_JSON}"
else
  ok "Dry-run complete. No containers or volumes were modified."
fi
