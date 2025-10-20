#!/usr/bin/env bash
set -euo pipefail

test -f dist/public/index.html || (echo "❌ Missing dist/public/index.html" && exit 1)
grep -q "api/\*" dist/index.js || (echo "❌ Missing /api/* guard in dist/index.js" && exit 1)

echo "✅ Dist verified"
