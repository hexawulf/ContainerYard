#!/bin/bash
# Nginx configuration update script for ContainerYard cAdvisor proxies
# This script should be run on the piapps server

NGINX_CONFIG="/etc/nginx/sites-available/container.piapps.dev"

# Backup current configuration
cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# Add cAdvisor proxy locations to the server block
cat >> "$NGINX_CONFIG" << 'EOF'

# Synology cAdvisor proxy (adjust LAN IP and port as needed)
location /cadvisor/synology/ {
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://192.168.1.150:9818/;
}

# PiApps2 cAdvisor proxy (piapps2 listens on 127.0.0.1:8082; reach via its LAN IP)
location /cadvisor/piapps2/ {
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://192.168.1.152:8082/;
}
EOF

# Test Nginx configuration
echo "Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Nginx configuration test passed. Reloading..."
    systemctl reload nginx
    echo "Nginx reloaded successfully."
else
    echo "Nginx configuration test failed. Restoring backup..."
    cp "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)" "$NGINX_CONFIG"
    echo "Backup restored. Please check the configuration manually."
    exit 1
fi

# Test the new proxy endpoints
echo "Testing new proxy endpoints..."
echo "Testing Synology cAdvisor proxy..."
curl -fsS https://container.piapps.dev/cadvisor/synology/api/v1.3/containers | jq 'type' >/dev/null && echo "Synology OK" || echo "Synology FAILED"

echo "Testing PiApps2 cAdvisor proxy..."
curl -fsS https://container.piapps.dev/cadvisor/piapps2/api/v1.3/containers | jq 'type' >/dev/null && echo "PiApps2 OK" || echo "PiApps2 FAILED"

echo "Nginx configuration update completed!"