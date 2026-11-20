#!/usr/bin/env bash
set -euo pipefail

test -f dist/public/index.html || (echo "❌ Missing dist/public/index.html" && exit 1)
grep -q "api/\*" dist/index.js || (echo "❌ Missing /api/* guard in dist/index.js" && exit 1)
for icon in favicon.ico favicon.svg apple-touch-icon.png; do
  test -s "dist/public/$icon" || (echo "❌ Missing dist/public/$icon" && exit 1)
done
grep -q 'rel="icon" href="/favicon.svg"' dist/public/index.html || (echo "❌ index.html does not link the favicon" && exit 1)

echo "✅ Dist verified"
