#!/bin/bash

# This script verifies the host logs API endpoints for all configured hosts.
# It requires the server to be running and the user to be logged in.
# You will need to get a valid CSRF token and session cookie from your browser.

# --- Configuration ---
API_BASE="http://localhost:5000/api"
CSRF_TOKEN="your_csrf_token_here"
COOKIE="your_cookie_here"

HOSTS=("piapps" "piapps2" "synology")
LOG_NAMES=("nginx_access" "nginx_error" "pm2_out" "pm2_err")

# --- Verification ---

for host in "${HOSTS[@]}"; do
  echo "--- Verifying host: $host ---"
  
  # Test listing available logs
  echo "Listing available logs for $host..."
  curl -s -H "Cookie: $COOKIE" -H "X-CSRF-Token: $CSRF_TOKEN" "$API_BASE/hosts/$host/logs" | jq .
  echo ""

  # Test fetching each log
  for log_name in "${LOG_NAMES[@]}"; do
    echo "Fetching log '$log_name' from $host..."
    curl -s -H "Cookie: $COOKIE" -H "X-CSRF-Token: $CSRF_TOKEN" "$API_BASE/hosts/$host/logs/$log_name?tail=10"
    echo ""
    echo "---"
  done
  
  echo ""
done

echo "--- Verification complete ---"
