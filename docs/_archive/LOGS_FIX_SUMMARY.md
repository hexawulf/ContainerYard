# Summary of Changes for Multi-Host Log Support

This document summarizes the changes made to implement multi-host log support in ContainerYard.

## 1. Backend Changes

### `server/src/config/hostlogs.ts`

- The `HOST_LOGS` constant was refactored from a flat object to a nested object, where the top-level keys are `hostId`s. This allows for defining log paths on a per-host basis.
- Entries for `piapps2` and `synology` were added to the `HOST_LOGS` object.

### `server/src/routes/hostLogs.ts`

- The routes were updated to be host-aware. The new routes are `/api/hosts/:hostId/logs` and `/api/hosts/:hostId/logs/:name`.
- The log retrieval logic was changed from reading local files with `tail` to using `docker exec` to run `tail` inside a container on the target host. This reuses the existing Docker connection logic and avoids the need for direct file access on remote hosts.
- The `getLogContent` function was updated to orchestrate the `docker exec` command.
- The dependency on the `fs` module for log retrieval was removed.
- The SSE (Server-Sent Events) implementation for log streaming was temporarily removed to simplify the initial implementation.

### `server/src/index.ts`

- The `logsRouter` was removed as its functionality is now covered by the `hostLogsRouter` and the container logs endpoint in `hosts.ts`.
- The `hostLogsRouter` is now mounted under the `/api/hosts` path.

## 2. Frontend Changes

### `client/src/App.tsx`

- The route for the host logs page was changed from `/host-logs` to `/hosts/:hostId/logs`.
- The `ProtectedHostLogs` component was updated to correctly pass the `hostId` from the route params to the `HostLogs` component.

### `client/src/pages/HostLogs.tsx`

- The `HostLogs` component now accepts a `hostId` prop.
- The `useQuery` hook was updated to include the `hostId` in the query key and the API endpoint, ensuring that the correct logs are fetched when the host changes.
- The `LogsViewer` endpoint was updated to include the `hostId`.

### `client/src/features/monitoring/ContainerTable.tsx`

- A "Host Logs" button was added to the `ContainerTable` component, which links to the host logs page for the host that the container belongs to.

### `client/src/components/ContainerCard.tsx`

- This component was removed as it was not being used.

## 3. Verification

- The `npm run check`, `npm run lint`, and `npm run build` commands were run to ensure the code is free of errors.
- A debug script, `scripts/verify-hostlogs.sh`, was created to test the new host logs API endpoints.

## How to Extend to Additional Hosts

To add support for a new host, you need to:

1.  Add a new entry in the `HOST_LOGS` object in `server/src/config/hostlogs.ts` with the `hostId` as the key and an object of log paths as the value.
2.  Ensure that the new host has a container named `cadvisor` running, or update the `getLogContent` function in `server/src/routes/hostLogs.ts` to use a different container for executing the `tail` command.
