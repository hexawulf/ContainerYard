# Grafana and Prometheus Log Configuration

This document explains where Grafana and Prometheus logs are stored and how they're configured to write to host files.

## Log File Locations

- **Grafana logs**: `/var/log/grafana/grafana.log`
- **Prometheus logs**: `/var/log/prometheus/prometheus.log`

These logs are accessible via the Host Logs page at `https://container.piapps.dev/host-logs`

## How It Works

### Grafana File Logging

Grafana is configured to write logs to files using environment variables in the docker-compose.yml:

```yaml
environment:
  GF_LOG_MODE: file
  GF_PATHS_LOGS: /var/log/grafana
  GF_LOG_LEVEL: info
volumes:
  - /var/log/grafana:/var/log/grafana
```

- `GF_LOG_MODE: file` enables file-based logging (instead of console-only)
- `GF_PATHS_LOGS` specifies the directory where logs are written inside the container
- The volume mount makes `/var/log/grafana` from the host available inside the container

### Prometheus File Logging

Prometheus doesn't natively support file logging, so we use a `tee` command to write logs to both stdout (for `docker logs`) and a file:

```yaml
entrypoint: /bin/sh
command: >-
  -c 'mkdir -p /var/log/prometheus &&
  prometheus
  --config.file=/etc/prometheus/prometheus.yml
  --storage.tsdb.retention.time=30d
  --web.enable-lifecycle 2>&1 | tee -a /var/log/prometheus/prometheus.log'
volumes:
  - /var/log/prometheus:/var/log/prometheus
```

- The command pipes all output (stdout and stderr) through `tee`
- `tee -a` appends to the log file while still displaying in `docker logs`
- The volume mount persists logs to the host

## Host Permissions

The log directories on the host are configured with the following permissions:

```bash
# Directories owned by container users, readable by adm group
drwxrwxr-x 2    472 adm /var/log/grafana
drwxrwxr-x 2 nobody adm /var/log/prometheus
```

- Grafana container runs as UID 472 (grafana user)
- Prometheus container runs as UID 65534 (nobody user)
- Both directories are in the `adm` group for host access
- Users in the `adm` group can read the logs (required for the web app)

## API Access

The Host Logs API provides access to these logs:

- **List logs**: `GET /api/hostlogs`
- **View Grafana logs**: `GET /api/hostlogs/grafana?tail=500`
- **View Prometheus logs**: `GET /api/hostlogs/prometheus?tail=500`
- **Diagnostics**: `GET /api/hostlogs/_diagnose` (admin only)

The API supports:
- `tail`: number of lines to retrieve (default 500, max 5000)
- `since`: time window (ISO date or seconds)
- `grep`: filter lines by pattern
- `follow`: enable streaming mode (SSE)
- `timestamps`: include timestamps

## Troubleshooting

### Logs not appearing

1. Check if containers are running:
   ```bash
   docker ps | grep -E 'grafana|prometheus'
   ```

2. Verify log files exist and are being written:
   ```bash
   ls -lh /var/log/grafana/grafana.log /var/log/prometheus/prometheus.log
   tail /var/log/grafana/grafana.log
   tail /var/log/prometheus/prometheus.log
   ```

3. Check container user can write to log directory:
   ```bash
   docker exec crypto-agent-grafana-1 ls -ld /var/log/grafana
   docker exec crypto-agent-prometheus-1 ls -ld /var/log/prometheus
   ```

4. Verify host permissions allow web app to read:
   ```bash
   groups  # Ensure adm group is listed
   cat /var/log/grafana/grafana.log | head
   ```

### Permission denied errors

If the web app can't read the logs, ensure the process user is in the `adm` group:

```bash
# For user running PM2 (typically 'zk')
sudo usermod -aG adm zk

# For www-data (if running under nginx/apache)
sudo usermod -aG adm www-data
```

### Recreating containers

If you need to recreate the containers to apply changes:

```bash
cd /home/zk/bots/crypto-agent
docker compose up -d grafana prometheus
```

The volume mounts will preserve existing logs on the host.

## Implementation Details

See `server/src/config/hostlogs.ts` for the allowlist of log files and `server/src/routes/hostLogs.ts` for the API implementation.
