#!/usr/bin/env bash
set -euo pipefail

test -f dist/public/index.html || (echo "❌ Missing dist/public/index.html" && exit 1)
grep -q "api/\*" dist/index.js || (echo "❌ Missing /api/* guard in dist/index.js" && exit 1)
for icon in favicon.ico favicon.svg apple-touch-icon.png; do
  test -s "dist/public/$icon" || (echo "❌ Missing dist/public/$icon" && exit 1)
done
grep -q 'rel="icon" href="/favicon.svg"' dist/public/index.html || (echo "❌ index.html does not link the favicon" && exit 1)

# Assert Firebase Auth SDK stays in its lazy chunk and is not bundled into main index-*.js
for chunk in dist/public/assets/index-*.js; do
  if [ -f "$chunk" ] && grep -q "identitytoolkit" "$chunk"; then
    echo "❌ Firebase SDK leaked into main bundle: $chunk"
    exit 1
  fi
done

echo "✅ Dist verified"
