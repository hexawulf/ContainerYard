#!/bin/bash
# ─────────────────────────────────────────────
# verify-hostlogs.sh  ·  ContainerYard host-logs verifier
# Author: 0xWulf
# Email:  0xwulf@proton.me
# Desc.:  Verify ContainerYard host-logs API + UI regressions
# Create Date: 2025-10-26 05:46:11
# Modified Date: 2025-10-26 05:46:11
# ─────────────────────────────────────────────

set -euo pipefail

# ── Config ───────────────────────────────────
BASE="https://container.piapps.dev"
CK="/tmp/pideck.cookies"
TAIL_DEFAULT=50

# Prefer to pass password via env: ADMIN_PASSWORD
PASS="${ADMIN_PASSWORD:-}"
if [[ -z "$PASS" ]]; then
  echo "[ERROR] Set ADMIN_PASSWORD env var before running." >&2
  exit 1
fi

# ── Helpers ──────────────────────────────────
_info() { printf "[%s] %s\n" "$(date -u +'%FT%TZ')" "$*"; }
_sep()  { printf -- "---------------------------------------------\n"; }

_login() {
  _info "Login to $BASE"
  /usr/bin/rm -f "$CK"
  /usr/bin/curl -sS -c "$CK" -H 'Content-Type: application/json'     -H "Origin: $BASE" -X POST "$BASE/api/auth/login"     --data "{\"password\":\"$PASS\"}" | /usr/bin/jq . >/dev/null
  _info "Auth me:"
  /usr/bin/curl -sS -b "$CK" "$BASE/api/auth/me" | /usr/bin/jq .
}

_hit() {
  local name="$1"; shift
  local qs="$*"
  _sep
  _info "GET /api/hostlogs/${name}?${qs}"
  /usr/bin/curl -sS -b "$CK" "$BASE/api/hostlogs/${name}?${qs}" | /usr/bin/head -n 30
}

main() {
  _login
  _hit "nginx_error" "tail=${TAIL_DEFAULT}&grep=error"
  _hit "nginx_access" "tail=${TAIL_DEFAULT}"
  _hit "pm2_out" "tail=${TAIL_DEFAULT}"
  _hit "pm2_err" "tail=${TAIL_DEFAULT}"
  _hit "grafana" "tail=${TAIL_DEFAULT}"
  _hit "prometheus" "since=3600&timestamps=1&tail=${TAIL_DEFAULT}"
  _sep
  _info "Done. If grafana/prometheus files are missing, ensure docker fallbacks are wired."
}

main "$@"
