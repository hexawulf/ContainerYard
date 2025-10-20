###### ChatGPT said:

# 🛠️ Fix-It Prompt — ContainerYard UI crash + null stats

**Role:** You are Claude Code acting as a repo surgeon.
 **Repo:** `/home/zk/projects/ContainerYard` (Vite + React client, Node/Express/TS server, PM2 runtime).

## Context & Symptoms

- Browser console shows “Runtime config: **API_BASE undefined**” and **React minified error** on `/dashboard`.
- API health endpoints are OK.
- `/api/hosts/piapps/containers` works, but `/containers/:id/stats` and `/hosts/:id/stats` sometimes return **null** fields.
- Goal: make the SPA resilient to missing env, stop the crash, and ensure numeric stats (no `null`).

## Objectives

1. **Frontend config hardening**: provide robust `API_BASE` resolution and avoid crashing when env vars are missing.
2. **Server runtime-config endpoint**: optional fallback for SPA to learn the API base at runtime.
3. **Stats normalization**: server must return numbers (0 when unknown) instead of `null/undefined`.
4. Ship `.env.production` for Vite to bake correct values.
5. Keep build green and PM2 online.

------

## Implement These Changes

### A) Client: robust API base + safe boot

**Edit `client/src/lib/api.ts`** (or wherever the HTTP client is created):

```
// client/src/lib/api.ts
const FALLBACK_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : '';

const runtimeBase =
  typeof window !== 'undefined' ? (window as any).__CY_API_BASE__ : '';

const API_BASE_RAW =
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ||
  runtimeBase ||
  FALLBACK_ORIGIN;

export const API_BASE_URL = API_BASE_RAW.replace(/\/+$/, ''); // strip trailing slash

// Ensure your fetch/axios instance uses API_BASE_URL and withCredentials:true
```

**Create (or update) `client/src/lib/authBootstrap.ts`** so the app can fetch runtime config if build-time env is missing:

```
// client/src/lib/authBootstrap.ts
export async function bootstrapRuntimeConfig() {
  if (!(window as any).__CY_API_BASE__) {
    try {
      const cfg = await fetch('/api/runtime-config', { credentials: 'include' }).then(r => r.json());
      (window as any).__CY_API_BASE__ = cfg?.apiBase || window.location.origin;
      (window as any).__CY_APP_NAME__ = cfg?.appName || 'ContainerYard';
      (window as any).__CY_AUTO_DISMISS__ = cfg?.autoDismiss ?? 'true';
    } catch {
      (window as any).__CY_API_BASE__ = window.location.origin;
    }
  }
}
```

**Wire bootstrap early (e.g., in `client/src/main.tsx` or `client/src/App.tsx`):**

```
import { bootstrapRuntimeConfig } from './lib/authBootstrap';
await bootstrapRuntimeConfig();
```

**Harden reads in `client/src/App.tsx`:**

```
const APP_NAME =
  (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() ||
  (window as any).__CY_APP_NAME__ ||
  'ContainerYard';

const AUTO_DISMISS =
  ((import.meta.env.VITE_AUTO_DISMISS as string | undefined) ??
   (window as any).__CY_AUTO_DISMISS__ ?? 'true') === 'true';
```

**Optional error boundary to avoid blank screen:**

```
// client/src/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{err?:string}> {
  state = { err: undefined as string|undefined };
  componentDidCatch(error: Error, _info: ErrorInfo) { this.setState({ err: error.message }); }
  render() {
    if (this.state.err) {
      const api = (window as any).__CY_API_BASE__ || (import.meta as any).env?.VITE_API_BASE;
      return (<pre style={{padding:24,color:'#ff8'}}>{`UI crashed: ${this.state.err}\nAPI_BASE=${api}`}</pre>);
    }
    return this.props.children;
  }
}
```

Wrap your root render with `<ErrorBoundary>`.

------

### B) Server: runtime config + numeric stats

**Expose runtime config in `server/src/index.ts` (before static serving):**

```
app.get('/api/runtime-config', (_req, res) => {
  res.json({
    apiBase: process.env.PUBLIC_API_BASE || '', // optional override
    appName: process.env.APP_NAME || 'ContainerYard',
    autoDismiss: process.env.AUTO_DISMISS ?? 'true',
  });
});
```

**Normalize numbers in per-container stats (where you send parsed values):**

```
// inside handler after parseContainerInstant(raw) -> s
res.json({
  cpuPct: Number(s.cpuPct || 0),
  memBytes: Number(s.memBytes || 0),
  memPct: Number(s.memPct || 0),
  netRx: Number(s.netRx || 0),
  netTx: Number(s.netTx || 0),
  blkRead: Number(s.blkRead || 0),
  blkWrite: Number(s.blkWrite || 0),
  ts: s.ts || new Date().toISOString(),
});
```

**Normalize numbers in host aggregation response:**

```
return {
  hostId,
  provider: 'DOCKER',
  cpuPercent: Number((cpuPercent || 0).toFixed(2)),
  memoryUsage: Number(memoryUsage || 0),
  memoryLimit: Number(memoryLimit || 0),
  memoryPercent: Number(((memoryLimit > 0 ? memoryUsage / memoryLimit : 0) * 100).toFixed(2)),
  networkRx: Number(networkRx || 0),
  networkTx: Number(networkTx || 0),
  blockRead: Number(blockRead || 0),
  blockWrite: Number(blockWrite || 0),
  timestamp: new Date().toISOString(),
};
```

------

### C) Vite prod env for stable builds

**Create `.env.production` at repo root:**

```
VITE_API_BASE=https://container.piapps.dev
VITE_APP_NAME=ContainerYard
VITE_AUTO_DISMISS=true
```

*(Optional)* Add `postcss.config.cjs` to quiet the PostCSS “from” warning:

```
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

and reference it in `vite.config.ts`:

```
export default defineConfig({
  // ...
  css: { postcss: './postcss.config.cjs' },
})
```

------

## Build, Restart, Verify

**Build + restart**

```
npm run build
pm2 restart containeryard --update-env
```

**Quick checks**

```
curl -s https://container.piapps.dev/api/runtime-config | jq .
BASE='https://container.piapps.dev'; CN='cy.sid'; CV='<your cookie>'
curl -s -b "$CN=$CV" "$BASE/api/hosts/piapps/containers" | jq 'length'
CID=$(curl -s -b "$CN=$CV" "$BASE/api/hosts/piapps/containers" | jq -r '.[0].id // .[0].name // .[0].Names[0]')
curl -s -b "$CN=$CV" "$BASE/api/hosts/piapps/containers/$CID/stats" | jq '{cpuPct,memBytes,memPct,netRx,netTx,blkRead,blkWrite,ts}'
curl -s -b "$CN=$CV" "$BASE/api/hosts/piapps/stats" | jq '{cpuPercent,memoryUsage,memoryLimit,memoryPercent,networkRx,networkTx,blockRead,blockWrite,timestamp}'
```

> Note: On Raspberry Pi, memory may remain `0` until the memory cgroup controller is enabled (`cgroup_memory=1 cgroup_enable=memory` in `/boot/firmware/cmdline.txt`, then reboot). CPU/NET/BLK should be numeric and non-null now.

------

## Acceptance Criteria

- No React crash on `/dashboard`; app renders even if build-time env is missing.
- `API_BASE` correctly resolves (env → runtime → window.location).
- Per-container and host stats return **numbers** (0 if unavailable), never `null`.
- Build succeeds (`verify-dist` passes), PM2 online, and `/api/health` & `/health` return 200