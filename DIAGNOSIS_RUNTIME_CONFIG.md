# Runtime config crash fix (2025-11)

Symptoms:
- UI crashed with "Cannot read properties of undefined (reading 'map')".
- /api/runtime-config returned 404 (missing endpoint).

Fix:
- Implemented /api/runtime-config on the server, returning { apiBase, hosts, features }.
- Hardened client runtime-config loader with safe defaults and guards on hosts.map.
- Re-verified /api/hosts and container listing endpoints for piapps and synology.

Notes:
- Do not change ContainerYard port (5008) or Nginx mappings for container.piapps.dev.
- The runtime-config endpoint is public and does not require authentication.
- Client now handles missing/invalid config gracefully with safe defaults.