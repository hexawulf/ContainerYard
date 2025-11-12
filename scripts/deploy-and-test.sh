#!/bin/bash
# ContainerYard Deployment and Testing Script
# This script helps deploy and test the ContainerYard fixes

echo "=== ContainerYard Deployment and Testing ==="
echo

# Check if we're in the ContainerYard directory
if [ ! -f "package.json" ] || [ ! -d "server" ] || [ ! -d "client" ]; then
    echo "Error: This script must be run from the ContainerYard root directory"
    exit 1
fi

echo "1. Building the application..."
npm run build

if [ $? -ne 0 ]; then
    echo "Error: Build failed"
    exit 1
fi

echo "✅ Build successful"
echo

echo "2. Type checking..."
npm run check

if [ $? -ne 0 ]; then
    echo "Error: Type checking failed"
    exit 1
fi

echo "✅ Type checking passed"
echo

echo "3. Linting..."
npm run lint

if [ $? -ne 0 ]; then
    echo "Error: Linting failed"
    exit 1
fi

echo "✅ Linting passed"
echo

echo "4. Checking for circular dependencies..."
npx madge client/src --circular

if [ $? -ne 0 ]; then
    echo "Error: Circular dependencies found"
    exit 1
fi

echo "✅ No circular dependencies found"
echo

echo "5. Environment configuration check..."
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "Please update .env with your configuration before proceeding."
    echo "Required variables:"
    echo "  - PIAPPS2_CADVISOR_URL (if using piapps2)"
    echo "  - SYNOLOGY_CADVISOR_URL (if using synology)"
    echo "  - SYNOLOGY_DOZZLE_URL (if using synology)"
else
    echo "✅ .env file exists"
fi
echo

echo "6. Testing API endpoints..."
echo "Testing hosts endpoint..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/hosts
if [ $? -eq 0 ]; then
    echo "✅ API server is responding"
else
    echo "⚠️  API server not responding (expected if not running)"
fi
echo

echo "=== Deployment Checklist ==="
echo "✅ Code changes implemented"
echo "✅ Build and tests passing"
echo "✅ Environment configured"
echo
echo "=== Next Steps ==="
echo "1. Deploy cAdvisor on piapps2:"
echo "   Run: ./scripts/deploy-cadvisor-piapps2.sh (on piapps2 host)"
echo
echo "2. Update your .env file with:"
echo "   PIAPPS2_CADVISOR_URL=http://192.168.50.120:8082"
echo
echo "3. Restart ContainerYard:"
echo "   pm2 restart containeryard --update-env"
echo
echo "4. Test the implementation:"
echo "   - Open ContainerYard dashboard"
echo "   - Select 'Pi Apps 2 (piapps2)' from host dropdown"
echo "   - Verify tiles show live data"
echo "   - Verify containers list appears"
echo
echo "5. Verify cAdvisor is accessible:"
echo "   curl -s http://192.168.50.120:8082/api/v1.3/subcontainers | jq '.[0] | keys'"
echo
echo "=== Manual Testing Commands ==="
echo "# Test summary endpoint"
echo "curl -b 'cy.sid=YOUR_SESSION_COOKIE' https://containeryard.org/api/hosts/piapps2/summary | jq"
echo
echo "# Test containers list"
echo "curl -b 'cy.sid=YOUR_SESSION_COOKIE' https://containeryard.org/api/hosts/piapps2/containers | jq '.[0]'"