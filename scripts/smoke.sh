#!/usr/bin/env bash
set -euo pipefail
BASE=${1:-https://container.piapps.dev}
curl -fsS "$BASE/api/health" | jq -e '.ok==true' >/dev/null && echo "✓ /api/health"
echo "Open $BASE/dashboard and hard-refresh (Ctrl/Cmd+Shift+R)."
