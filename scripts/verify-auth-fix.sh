#!/usr/bin/env bash
set -e

echo "🔍 Verifying Auth Crash Fix"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-https://container.piapps.dev}"
API_URL="${BASE_URL}/api"

echo "📍 Target: $BASE_URL"
echo ""

# Test 1: Health check
echo "Test 1: API Health Check"
echo "-------------------------"
if curl -sf "${API_URL}/health" > /dev/null; then
  echo -e "${GREEN}✓${NC} API health endpoint responding"
else
  echo -e "${RED}✗${NC} API health endpoint not responding"
  echo "  Run: pm2 restart containeryard"
  exit 1
fi
echo ""

# Test 2: Auth endpoint (may return 401 if not authenticated, which is OK)
echo "Test 2: Auth Endpoint Accessibility"
echo "------------------------------------"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/cookies.txt -c /tmp/cookies.txt "${API_URL}/auth/me")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "304" ]; then
  echo -e "${GREEN}✓${NC} Auth endpoint accessible (HTTP $STATUS)"
else
  echo -e "${RED}✗${NC} Auth endpoint returned unexpected status: $STATUS"
  exit 1
fi
echo ""

# Test 3: Check source maps are generated
echo "Test 3: Source Maps Generated"
echo "------------------------------"
if [ -f "dist/public/assets/index-"*.js.map ]; then
  echo -e "${GREEN}✓${NC} Source maps found in dist/public/assets/"
  ls -lh dist/public/assets/*.map | awk '{print "  " $9 " (" $5 ")"}'
else
  echo -e "${RED}✗${NC} Source maps not found"
  echo "  Run: npm run build"
  exit 1
fi
echo ""

# Test 4: Check critical files exist
echo "Test 4: Critical Files Present"
echo "-------------------------------"
FILES=(
  "client/src/lib/authBootstrap.ts"
  "vite.config.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file exists"
  else
    echo -e "${RED}✗${NC} $file missing"
    exit 1
  fi
done
echo ""

# Test 5: Check for proper cache control in api.ts
echo "Test 5: Cache Control Implementation"
echo "-------------------------------------"
if grep -q "cache: 'no-store'" client/src/lib/api.ts; then
  echo -e "${GREEN}✓${NC} Cache control implemented for auth endpoints"
else
  echo -e "${YELLOW}⚠${NC}  Cache control not found in api.ts"
fi
echo ""

# Test 6: Check sourcemap config in vite.config.ts
echo "Test 6: Vite Sourcemap Configuration"
echo "-------------------------------------"
if grep -q "sourcemap: true" vite.config.ts; then
  echo -e "${GREEN}✓${NC} Source maps enabled in vite.config.ts"
else
  echo -e "${RED}✗${NC} Source maps not enabled"
  exit 1
fi
echo ""

echo "=========================================="
echo -e "${GREEN}✓ All verification checks passed!${NC}"
echo ""
echo "Next Steps:"
echo "1. Deploy the build: pm2 restart containeryard --update-env"
echo "2. Open browser DevTools at: $BASE_URL"
echo "3. Check console for errors (should be none)"
echo "4. Test: await (await fetch('/api/auth/me', {credentials:'include'})).json()"
echo "5. Navigate to /dashboard and verify no crashes"
echo ""
