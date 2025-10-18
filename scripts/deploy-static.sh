#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm build
pm2 delete containeryard || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 status containeryard
curl -sI http://127.0.0.1:5001 | sed -n '1p'
