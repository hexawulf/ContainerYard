# todo.md — Recovery & hardening workflow (for Sonnet 4.5)

> **Context:** Home-hosted sites behind Cloudflare on `piapps` (Ubuntu).
>  Front door: Nginx on ports 80/443 → app backends on localhost.
>  ContainerYard **API must run on :5008** (Synology uses :5001).
>  Goal: restore availability, standardize Cloudflare real-IP, fix API port, and harden.

------

## 0) Quick facts (don’t change)

- Primary host IP: `192.168.50.102` (eth0 only; Wi-Fi disabled)
- WAN IP example: `122.116.150.249` (update A records if it changes)
- ContainerYard UI: `:5003` (or static SPA via Nginx)
   ContainerYard **API: :5008** (health `/api/health`, metrics `/metrics`)

------

## 1) Snapshot + basic triage (run on piapps)

```
# WAN & listeners
curl -s https://ipinfo.io/ip
ss -ltnp | grep -E ':(80|443)\b' || echo NO_80443

# Is Cloudflare actually reaching origin?
tail -n 80 /var/log/nginx/access.log | grep -E '^(104\.|172\.64\.|188\.114\.|162\.158\.)' || echo NO_CF_HITS
```

**Decision:**

- If `NO_CF_HITS` → check Cloudflare/DNS first (Step 4) after ensuring Nginx is clean (Step 2–3).
- If CF hits appear but users get errors → backend/upstream issue (Step 6–7).

------

## 2) Nginx housekeeping (delete stale backups)

```
sudo find /etc/nginx/sites-available -maxdepth 1 -type f \
  \( -name '*.bak' -o -name '*.bk' -o -name '*.bak.*' -o -name '*.bk.*' -o -name '*backup*' \) \
  -delete
ls -ltr /etc/nginx/sites-available
```

------

## 3) Single source of truth: Cloudflare real client IPs

**Keep exactly one global include:** `/etc/nginx/conf.d/cloudflare_real_ip.conf`

```
sudo tee /etc/nginx/conf.d/cloudflare_real_ip.conf >/dev/null <<'NGX'
# Cloudflare egress ranges — official IPv4/IPv6
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/12;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

real_ip_header CF-Connecting-IP;
NGX

# Remove any old variants/includes that cause duplicates
sudo rm -f /etc/nginx/conf.d/cloudflare_realip.conf /etc/nginx/snippets/cloudflare_realip.conf
sudo sed -i 's#^\s*include /etc/nginx/conf\.d/cloudflare_real_ip\.conf;.*##' \
  /etc/nginx/sites-available/* /etc/nginx/sites-enabled/* 2>/dev/null || true

sudo nginx -t && sudo systemctl reload nginx
```

------

## 4) Cloudflare edge sanity (dashboard tasks)

**For each host (start with `pideck.piapps.dev`):**

- **DNS:** A → current WAN IP; **Proxy = ON** (orange). **Delete AAAA** records.
- **SSL/TLS → Overview:** **Full (strict)**.
- **Edge Certificates:** **Always Use HTTPS = ON**.
   (Temporary: **IPv6 Compatibility = OFF** if origin v6 isn’t reachable; optional to re-enable later.)
- **WAF/Firewall:** disable custom block rules during testing.

**Bypass test (if needed):** set DNS record to **DNS only (grey)** to confirm origin works; then switch back to orange.

------

## 5) Ensure :80 is a clean redirect

```
sudo tee /etc/nginx/sites-available/redirect_piapps.conf >/dev/null <<'NGINX'
server {
  listen 80 default_server;
  server_name pideck.piapps.dev container.piapps.dev mybooks.piapps.dev codepatchwork.com;
  return 301 https://$host$request_uri;
}
NGINX
sudo ln -sf /etc/nginx/sites-available/redirect_piapps.conf /etc/nginx/sites-enabled/redirect_piapps.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI http://127.0.0.1/ | head -n 5  # expect HTTP/1.1 301 and Location: https://...
```

------

## 6) ContainerYard processes — **run UI + API separately**

### 6.1 API on **:5008** (remove hidden preloads)

```
cd ~/projects/ContainerYard

# Kill any old definition that might preload dotenv/config via NODE_OPTIONS
pm2 delete containeryard-api || true

# Start clean — explicitly blank NODE_OPTIONS, force :5008
NODE_OPTIONS= PORT=5008 NODE_ENV=production \
pm2 start dist/index.js --name containeryard-api --interpreter node --node-args "" --update-env

pm2 save
```

**Verify:**

```
ss -ltnp | grep -E ':(5008)\b' || echo NO_5008
curl -sS -m 5 http://127.0.0.1:5008/api/health || echo 5008_NO_HEALTH
pm2 logs containeryard-api --lines 80
```

> If logs show `connect ECONNREFUSED 127.0.0.1:6379`, start Redis or point to a real Redis:
>
> ```
> sudo systemctl status redis-server 2>/dev/null || \
> (sudo apt-get update && sudo apt-get install -y redis-server && sudo systemctl enable --now redis-server)
> redis-cli ping
> ```

### 6.2 UI process (if needed) — typically on **:5003**

If UI is served by Node (not purely static):

```
# Example only — adjust to your actual UI entry if different
# NODE_OPTIONS= PORT=5003 NODE_ENV=production pm2 start dist/ui.js --name containeryard-ui --update-env
# pm2 save
```

(If the SPA is served statically by Nginx from `dist/public`, you don’t need a UI Node port.)

------

## 7) Nginx vhost for `container.piapps.dev` (UI + API split)

**Key points:**

- Root serves the SPA (`dist/public`) with `try_files`.
- `/api/*` proxies to **127.0.0.1:5008**.
- Health/metrics pass through to API.

```
# /etc/nginx/sites-available/container.piapps.dev (essentials)
server {
  listen 80;
  server_name container.piapps.dev;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl; http2 on;
  server_name container.piapps.dev;

  ssl_certificate     /etc/letsencrypt/live/piapps.dev-0001/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/piapps.dev-0001/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  include /etc/nginx/conf.d/cloudflare_real_ip.conf;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # SPA
  root /home/zk/projects/ContainerYard/dist/public;
  index index.html;

  location ^~ /assets/ {
    try_files $uri =404;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # API (generic)
  location /api/ {
    proxy_pass http://127.0.0.1:5008;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
    proxy_connect_timeout 15s;
    client_max_body_size 25m;
  }

  # Health/metrics passthrough
  location = /health  { proxy_pass http://127.0.0.1:5008/api/health; }
  location = /metrics { proxy_pass http://127.0.0.1:5008/metrics;     }

  # SPA shell + fallback
  location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; try_files $uri =404; }
  location / { add_header Cache-Control "no-cache"; try_files $uri /index.html; }
}
```

Apply:

```
sudo nginx -t && sudo systemctl reload nginx
```

------

## 8) End-to-end tests

```
# Direct API
curl -sS http://127.0.0.1:5008/api/health

# Through TLS & Host locally
curl -vk --connect-to ::127.0.0.1:443 https://container.piapps.dev/api/health -m 8

# Cloudflare e2e (from LTE in a browser), then on the server:
tail -n 80 /var/log/nginx/access.log | grep -E '^(104\.|172\.64\.|188\.114\.|162\.158\.)' || echo NO_CF_HITS
```

------

## 9) Optional: auto-refresh Cloudflare IP ranges daily

```
sudo tee /usr/local/sbin/update-cloudflare-realip.sh >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
OUT="/etc/nginx/conf.d/cloudflare_real_ip.conf"
TMP="$(mktemp)"
{
  echo "# Generated: $(date -u +%FT%TZ)"
  echo "# Source: https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6"
  curl -fsSL https://www.cloudflare.com/ips-v4 | sed 's#^#set_real_ip_from #; s#$#;#'
  curl -fsSL https://www.cloudflare.com/ips-v6 | sed 's#^#set_real_ip_from #; s#$#;#'
  echo; echo "real_ip_header CF-Connecting-IP;"
} > "$TMP"
if ! cmp -s "$TMP" "$OUT"; then
  install -o root -g root -m 0644 "$TMP" "$OUT"
  nginx -t && systemctl reload nginx
fi
rm -f "$TMP"
SH
sudo chmod 755 /usr/local/sbin/update-cloudflare-realip.sh
( crontab -l 2>/dev/null; echo '17 3 * * * /usr/local/sbin/update-cloudflare-realip.sh' ) | crontab -
```

------

## 10) Backup working Nginx config

```
sudo tar -C /etc -czf /root/nginx-config-backup.$(date -u +%Y%m%dT%H%M%SZ).tgz nginx
ls -lh /root/nginx-config-backup.*.tgz | tail -n 1
```

------

## Rollback notes

- Revert Cloudflare to **DNS only (grey)** to bypass the edge temporarily.
- Delete or stop `containeryard-api` in PM2; restart with previous port if needed.
- Restore Nginx from backup: `sudo tar -xzf /root/nginx-config-backup.<timestamp>.tgz -C /`

------

### Success criteria

- `curl -sS http://127.0.0.1:5008/api/health` returns OK/JSON.
- `curl -vk --connect-to ::127.0.0.1:443 https://container.piapps.dev/api/health` returns OK.
- Access log shows Cloudflare IPs (104.*, 172.64.*, 188.114.*, 162.158.*) for remote traffic.
- No duplicate `real_ip_header` errors on `nginx -t`.