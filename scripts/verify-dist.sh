#!/usr/bin/env bash
set -euo pipefail

test -f dist/public/index.html || (echo "❌ Missing dist/public/index.html" && exit 1)
grep -Eq 'api/(\*|\{\*splat\})' dist/index.js || (echo "❌ Missing /api/* guard in dist/index.js" && exit 1)
for icon in favicon.ico favicon.svg apple-touch-icon.png; do
  test -s "dist/public/$icon" || (echo "❌ Missing dist/public/$icon" && exit 1)
done
grep -q 'rel="icon" href="/favicon.svg"' dist/public/index.html || (echo "❌ index.html does not link the favicon" && exit 1)

# The CSP is script-src 'self' (no 'unsafe-inline'): inline scripts and inline
# event handlers in index.html are blocked in production and fail silently.
# JSON data blocks (type="application/ld+json") are not executed and are fine.
if grep -Eo '<script[^>]*>' dist/public/index.html | grep -v 'src=' | grep -vq 'type="application/ld+json"'; then
  echo "❌ index.html has an inline <script> (blocked by the CSP); move it to client/public/*.js"
  exit 1
fi
if grep -Eiq '<[a-z]+[^>]*[[:space:]]on[a-z]+=' dist/public/index.html; then
  echo "❌ index.html has an inline event handler (on...=, blocked by the CSP)"
  exit 1
fi
[ -f dist/public/theme-init.js ] || (echo "❌ dist/public/theme-init.js missing (no-flash theme script)" && exit 1)
grep -q '<script src="/theme-init.js"></script>' dist/public/index.html || (echo "❌ index.html does not load /theme-init.js" && exit 1)

# Assert Firebase Auth SDK stays in its lazy chunk and is not bundled into main index-*.js
for chunk in dist/public/assets/index-*.js; do
  if [ -f "$chunk" ] && grep -q "identitytoolkit" "$chunk"; then
    echo "❌ Firebase SDK leaked into main bundle: $chunk"
    exit 1
  fi
done

echo "✅ Dist verified"
