#!/bin/bash
set -euo pipefail

BASE="https://containeryard.org"
COOKIE="${CY_COOKIE:-}"
[[ -z "$COOKIE" ]] && { echo "Set CY_COOKIE=cy.sid=..."; exit 1; }

echo "==> PM2 env snapshot (grep PIAPPS2_)"
pm2 env containeryard | grep -E 'PIAPPS2_' -n || true

echo "==> Direct cAdvisor reachability"
curl -sS http://192.168.50.120:8082/api/v1.3/subcontainers -m 5 | jq 'length' || echo "FAIL - cAdvisor not reachable"

echo "==> Server containers"
curl -sS -b "$COOKIE" "$BASE/api/hosts/piapps2/containers" | jq 'length'

echo "==> Server summary"
curl -sS -b "$COOKIE" "$BASE/api/hosts/piapps2/summary" | jq