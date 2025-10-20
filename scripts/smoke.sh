#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-https://container.piapps.dev}"

echo "== HTML (dashboard)"
curl -fsSI "$BASE/dashboard" | head -n1 | grep -q "200"

echo "== SPA assets reachable (checking index.html)"
curl -fsSI "$BASE/" | head -n1 | grep -q "200"

echo "== API JSON 404 for unknown route"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/does-not-exist")
if [ "$HTTP_CODE" != "404" ]; then
  echo "❌ Expected 404, got $HTTP_CODE"
  exit 1
fi
CONTENT_TYPE=$(curl -sS -I "$BASE/api/does-not-exist" | grep -i "content-type" | grep -i "json")
if [ -z "$CONTENT_TYPE" ]; then
  echo "❌ Expected JSON response"
  exit 1
fi

echo "✅ Smoke OK"
