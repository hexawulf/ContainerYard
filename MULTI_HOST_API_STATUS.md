# Multi-Host ContainerYard API Status

## Overview

ContainerYard now supports multi-host container observability with consistent APIs across different host types:

- **DOCKER** hosts (piapps): Full Docker API access
- **CADVISOR_ONLY** hosts (piapps2, synology): cAdvisor-based monitoring

## ContainerDetail JSON Contract

All hosts return a consistent `ContainerDetail` object:

```typescript
interface ContainerDetail {
  id: string;
  name: string;        // Non-null container name
  image: string;       // Non-null container image
  provider: "DOCKER" | "CADVISOR_ONLY";
  hostId: string;
  state: string;
  status: string;
  node: string;
  createdAt: string;
  labels: Record<string, string>;
  networks: NormalizedNetwork[];
  ports: NormalizedPort[];
  composeProject?: string | null;
  command?: string | null;
  env: ContainerEnvVar[];
  mounts: ContainerMount[];
  startedAt?: string | null;
}
```

## Logs JSON Contract

The logs endpoint returns a unified response format:

```typescript
type LogsResponse =
  | { mode: "docker"; content: string; truncated: boolean }
  | { mode: "unsupported"; message: string }
  | { mode: "dozzle"; message: string; dozzleUrl: string };
```

### Behavior by Host Type

**DOCKER hosts (piapps)**:
```json
{
  "mode": "docker",
  "content": "<actual log content>",
  "truncated": false
}
```

**CADVISOR_ONLY without Dozzle (piapps2)**:
```json
{
  "mode": "unsupported",
  "message": "Live logs are not available for this host yet."
}
```

**CADVISOR_ONLY with Dozzle (synology)**:
```json
{
  "mode": "dozzle",
  "message": "Open this container in Dozzle.",
  "dozzleUrl": "https://container.piapps.dev/dozzle/ds920/#/container/<containerId>"
}
```

## API Endpoints

### Container List
```
GET /api/hosts/{hostId}/containers
```
Returns: `ContainerSummary[]`

### Container Detail
```
GET /api/hosts/{hostId}/containers/{containerId}
```
Returns: `ContainerDetail`

### Container Logs
```
GET /api/hosts/{hostId}/containers/{containerId}/logs
```
Returns: `LogsResponse`

### Container Stats
```
GET /api/hosts/{hostId}/containers/{containerId}/stats
```
Returns: `NormalizedStats`

## Host Configuration

Hosts are configured in `server/src/config/hosts.ts`:

```typescript
const hostDefinitions: Record<HostId, HostConfig> = {
  piapps: {
    id: "piapps",
    name: "Pi Apps (piapps)",
    provider: "DOCKER",
    nodeLabel: "piapps",
    docker: { socketPath: "/var/run/docker.sock" }
  },
  piapps2: {
    id: "piapps2",
    name: "Pi Apps 2 (piapps2)",
    provider: "CADVISOR_ONLY",
    nodeLabel: "piapps2",
    cadvisorUrl: env.PIAPPS2_CADVISOR_URL
  },
  synology: {
    id: "synology",
    name: "Synology (synology)",
    provider: "CADVISOR_ONLY",
    nodeLabel: "synology",
    dozzleUrl: env.SYNOLOGY_DOZZLE_URL,
    cadvisorUrl: env.SYNOLOGY_CADVISOR_URL
  }
};
```

## URL Encoding

Container IDs from cAdvisor may contain slashes (e.g., `/system.slice/docker-xxx.scope`). These must be URL-encoded when making API requests:

```bash
# Raw container ID
/system.slice/docker-ae682a106a70a7497cd40413a692310042b6d97c83296ee288af33b7761d895c.scope

# URL-encoded
%2Fsystem.slice%2Fdocker-ae682a106a70a7497cd40413a692310042b6d97c83296ee288af33b7761d895c.scope
```

The frontend automatically handles URL encoding via the updated `getQueryFn` in `client/src/lib/queryClient.ts`.

## Verification

Use the verification script to test all endpoints:

```bash
./scripts/verify-multihost-api.sh
```

This script tests:
- Container listing for all hosts
- Container detail retrieval for all hosts
- Logs endpoint behavior for all host types
- Proper JSON response formats

## Browser Testing

Access the ContainerYard dashboard at `https://container.piapps.dev/dashboard` and verify:

1. **Container Overview Panel**: Shows container details for all hosts
2. **Logs Drawer**: Shows appropriate content based on host type:
   - DOCKER hosts: Real logs with search/filter
   - CADVISOR_ONLY without Dozzle: "Live logs are not available for this host yet."
   - CADVISOR_ONLY with Dozzle: "Open this container in Dozzle." button

## Summary

All multi-host functionality is now working correctly:

- ✅ Container overview shows details for piapps2 and synology
- ✅ Logs drawer shows appropriate content (real logs, unsupported message, or Dozzle button)
- ✅ No more "Failed to fetch logs" errors
- ✅ Consistent JSON contracts across all host types
- ✅ Proper URL encoding for container IDs with slashes