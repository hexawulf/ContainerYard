#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:5008/api/hosts"

echo "== HOSTS =="
/usr/bin/curl -sS "$BASE" | /usr/bin/jq -r '.[] | "\(.id) provider=\(.provider)"'

for H in piapps piapps2 synology; do
  echo -e "\n==== $H containers ===="
  /usr/bin/curl -sS "$BASE/$H/containers" \
    | /usr/bin/jq '.[0:3] | .[] | {host:.hostId,id:.id,name:.name}'
done

PIAPPS_ID=$(/usr/bin/curl -sS "$BASE/piapps/containers"   | /usr/bin/jq -r '.[0].id')
P2_ID=$(/usr/bin/curl -sS "$BASE/piapps2/containers"      | /usr/bin/jq -r '.[0].id')
DS_ID=$(/usr/bin/curl -sS "$BASE/synology/containers"     | /usr/bin/jq -r '.[0].id')

echo -e "\n==== DETAIL ===="
for H in piapps piapps2 synology; do
  CID_VAR=$(echo "${H^^}_ID" | tr '-' '_')
  CID=${!CID_VAR}
  echo "-- $H ($CID)"
  /usr/bin/curl -sS "$BASE/$H/containers/$CID" | /usr/bin/jq .
done

echo -e "\n==== LOGS (status + body preview) ===="
for H in piapps piapps2 synology; do
  CID_VAR=$(echo "${H^^}_ID" | tr '-' '_')
  CID=${!CID_VAR}
  echo "-- $H logs"
  /usr/bin/curl -sS -D - "$BASE/$H/containers/$CID/logs" | head -40 || echo "LOG REQUEST FAILED for $H"
  echo
done
