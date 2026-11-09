# Container Inventory — piapps & Synology (for ContainerYard)

_Last updated: 2025-10-14 01:21:39Z (UTC)_

This doc summarizes your current Docker services on **piapps** (`~/bots/crypto-agent`) and **Synology** (`/volume1/docker/media-stack`) with their **networks, IPs, and ports**. It also includes quick commands to re-check live details and tips to register these hosts in **ContainerYard.org**.

---

## 1) piapps — `~/bots/crypto-agent` (compose project: `crypto-agent`)

> Source: your container inspect output and prior setup notes.

| Service (container)                                          | Image (typical)                 | Network                    | IP (reported)                       | Host Port(s)                                      | Notes                                                  |
| ------------------------------------------------------------ | ------------------------------- | -------------------------- | ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| **prometheus** (`crypto-agent-prometheus-1`)                 | `prom/prometheus`               | `crypto-agent_crypto_net`  | **172.19.0.3**                      | `9090` (localhost)                                | Scrapes `cadvisor`, `freqtrade-exporter`, itself.      |
| **grafana** (`crypto-agent-grafana-1`)                       | `grafana/grafana-oss`           | `crypto-agent_crypto_net`  | *(not captured in inspect snippet)* | `3000` (localhost)                                | Dashboards; Prometheus datasource.                     |
| **freqtrade** (`crypto-agent-freqtrade-1`)                   | `freqtradeorg/freqtrade:stable` | `crypto-agent_crypto_net`  | *(dynamic)*                         | none (API served to exporter at `freqtrade:8080`) | Running dry-run / sandbox.                             |
| **freqtrade-exporter** (`crypto-agent-freqtrade-exporter-1`) | exporter image                  | `crypto-agent_crypto_net`  | **172.19.0.5**                      | `9091` (internal only)                            | Exposes Freqtrade metrics to Prometheus.               |
| **cadvisor (piapps)** (`crypto-agent-cadvisor-1`)            | `gcr.io/cadvisor/cadvisor`      | **`crypto-agent_default`** | **172.18.0.2**                      | none (internal only)                              | Exposes `/metrics` on 8080 to the **compose network**. |

**Prometheus scrape jobs (piapps):**

- `prometheus -> localhost:9090`
- `freqtrade -> freqtrade-exporter:9091`
- `cadvisor -> cadvisor:8080` (piapps, relabeled `node="piapps"`)
- `cadvisor_synology -> 192.168.50.147:9818` (Synology, relabeled `node="synology"`)

**Quick health check:**

```bash
# Show targets, health, and last errors
curl -s 'http://localhost:9090/api/v1/targets?state=any'   | jq -r '.data.activeTargets[] | "\(.labels.job)  \(.labels.instance)  health=\(.health)  lastError=\(.lastError)"'

# Show available node labels (expect: ["piapps","synology"])
curl -s http://localhost:9090/api/v1/label/node/values
```

---

## 2) Synology — `/volume1/docker/media-stack`

> Source: your `docker-compose.yml` (static IPs on `mangrove_dockernet`).

| Service (container)     | Image                          | Network              | Static IP       | Host Port(s)      | Volumes (key)                                                |
| ----------------------- | ------------------------------ | -------------------- | --------------- | ----------------- | ------------------------------------------------------------ |
| **tautulli**            | `tautulli/tautulli`            | `mangrove_dockernet` | **172.18.0.10** | `9814:8181`       | `/volume1/docker/tautulli:/config`                           |
| **sabnzbd**             | `linuxserver/sabnzbd`          | `mangrove_dockernet` | **172.18.0.11** | `9810:8080`       | `/volume1/docker/sabnzbd:/config`, `/volume1/docker/downloads:/downloads` |
| **radarr**              | `linuxserver/radarr`           | `mangrove_dockernet` | **172.18.0.12** | `9811:7878`       | `/volume1/docker/radarr:/config`                             |
| **sonarr**              | `linuxserver/sonarr`           | `mangrove_dockernet` | **172.18.0.13** | `9812:8989`       | `/volume1/docker/sonarr:/config`                             |
| **bazarr**              | `ghcr.io/morpheus65535/bazarr` | `mangrove_dockernet` | **172.18.0.14** | `9813:6767`       | `/volume1/docker/bazarr:/config`                             |
| **prowlarr**            | `lscr.io/linuxserver/prowlarr` | `mangrove_dockernet` | **172.18.0.15** | `9815:9696`       | `/volume1/docker/prowlarr:/config`                           |
| **dozzle**              | `amir20/dozzle`                | `mangrove_dockernet` | **172.18.0.16** | `9816:8080`       | `/var/run/docker.sock:ro`                                    |
| **watchtower**          | `containrrr/watchtower`        | *(host)*             | —               | —                 | `/var/run/docker.sock`                                       |
| **plex**                | `lscr.io/linuxserver/plex`     | `mangrove_dockernet` | **172.18.0.17** | `32400:32400/tcp` | `/volume1/docker/plex:/config`, media mounts                 |
| **cadvisor (Synology)** | `gcr.io/cadvisor/cadvisor`     | `mangrove_dockernet` | **172.18.0.18** | `9818:8080`       | `/volume1/@docker:/var/lib/docker:ro`, etc.                  |

**LAN endpoint important to Prometheus:** `http://192.168.50.147:9818/metrics`

**Firewall tip:** Allow 9818/tcp from the **piapps host only**.

---

## 3) ContainerYard.org integration

Add **two hosts** in ContainerYard (or your agent config):  

- **Host A — piapps**
  - API/SSH: your usual management method.
  - Networks of interest: `crypto-agent_crypto_net`, `crypto-agent_default`.
  - Key services: prometheus (9090), grafana (3000), freqtrade, exporter, cadvisor.
- **Host B — Synology**
  - Expose/allow the ContainerYard agent or SSH as needed.
  - Network: `mangrove_dockernet` (static IPs known).
  - Key services: media suite + **cadvisor (9818)**.

**Recommended labels (for clarity inside ContainerYard):**

- `stack=crypto-agent`, `node=piapps` for Pi containers.
- `stack=media`, `node=synology` for Synology containers.

---

## 4) Re-check live inventories (copy/paste)

### On **piapps** (crypto-agent project)

```bash
cd ~/bots/crypto-agent

# Containers
docker compose ps -a

# Networks and IPs
for c in $(docker compose ps -q); do
  n=$(docker inspect -f '{.Name}' "$c" | sed 's#^/##')
  echo "---- $n ----"
  docker inspect -f '{json .NetworkSettings.Networks}' "$c" | jq
done
```

### On **Synology** (media-stack project)

```bash
cd /volume1/docker/media-stack

# Containers
docker compose ps -a

# Networks and IPs (static in compose)
for c in $(docker compose ps -q); do
  n=$(docker inspect -f '{.Name}' "$c" | sed 's#^/##')
  echo "---- $n ----"
  docker inspect -f '{json .NetworkSettings.Networks}' "$c" | jq
done
```

---

## 5) How the two stacks complement each other

- **Synology** runs your **media services** and exposes **cAdvisor on 9818**, giving full container metrics.
- **piapps** runs **Prometheus + Grafana** and pulls metrics from:
  - **Synology cAdvisor** (remote: `192.168.50.147:9818`) labeled `node="synology"`
  - **Pi cAdvisor** and **Freqtrade exporter** labeled `node="piapps"`
- In Grafana, a dashboard variable `node` lets you switch views between **piapps** and **synology** on the same panels.

---

## 6) Quick links & reminders

- Grafana (tunneled): `http://localhost:3000`
- Prometheus (tunneled): `http://localhost:9090`
- Synology cAdvisor check: `curl -s http://192.168.50.147:9818/metrics | head`
- Prometheus label check: `curl -s http://localhost:9090/api/v1/label/node/values`

---

**That’s it!** This inventory is ready to paste into ContainerYard and should make it trivial to register both hosts and map services to networks.
