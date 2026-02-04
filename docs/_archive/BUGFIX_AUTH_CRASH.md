# Bugfix: React Error #310 - Auth Bootstrap Crash

## Root Cause

The production crash (React error #310 with "Cannot access 'I' before initialization") was caused by:

1. **TDZ (Temporal Dead Zone) issues**: `API_BASE` constant was not properly initialized before use, causing reference errors during module initialization when circular imports occurred.

2. **Unstable hook implementation**: `useApiHealth` hook lacked cleanup guards, allowing state updates on unmounted components and potentially causing re-render loops.

3. **Missing cache control**: Auth endpoints (`/api/auth/*`) were being cached by the browser, leading to stale session data in the SPA that could cause authentication state mismatches.

4. **Non-hardened bootstrap**: The app health check during bootstrap could throw unhandled errors, crashing the UI before React could mount error boundaries.

## Fixes Applied

### 1. Enable Source Maps (vite.config.ts)
- Added `sourcemap: true` to build config for production debugging
- Future crashes will show real stack traces instead of minified variable names

### 2. Harden API Client (client/src/lib/api.ts)
- **Fixed API_BASE initialization**: Added `.replace(/\/+$/, '')` to normalize trailing slashes and ensure proper initialization order
- **Added cache control**: Auth endpoints now automatically use `cache: 'no-store'` to prevent stale sessions
- **Improved path normalization**: Ensures paths always start with `/` before joining with base URL
- **Stabilized useApiHealth hook**: Added mounted flag to prevent state updates after unmount, added explicit cleanup

### 3. Non-Fatal Auth Bootstrap (client/src/lib/authBootstrap.ts)
- Created new `loadUserSafe()` function that never throws
- Created `checkApiHealthSafe()` that logs warnings instead of crashing
- All auth errors are caught and logged, but never crash the UI

### 4. Updated App Bootstrap (client/src/App.tsx)
- Replaced direct fetch with `checkApiHealthSafe()` from authBootstrap
- Added try/catch/finally to guarantee `setBootChecking(false)` runs
- Removed dependency on `API_BASE` constant to avoid import order issues

## Verification Steps

### 1. Build & Restart
```bash
npm ci
npm run build
pm2 restart containeryard --update-env
```

Expected: Clean build with source map generation (`map: 3,136.40 kB`)

### 2. Browser Console Tests

Open DevTools Console at https://container.piapps.dev:

```javascript
// Test 1: Health check
await (await fetch('/api/health')).text()
// Expected: "OK" or similar healthy response

// Test 2: Auth endpoint (with credentials)
await (await fetch('/api/auth/me', {credentials:'include'})).json()
// Expected: { user: {...} } or {} or 401 - NO crash

// Test 3: Check for errors
// Expected: No "Minified React error #310" in console
```

### 3. Network Tab Verification
- `GET /api/health` → 200 OK
- `GET /api/auth/me` → 200 or 304 is fine (client uses `no-store` now, but server may still cache)
- Check Response Headers on `/api/auth/me`: should not be cached by browser

### 4. UI Verification
- Navigate to `/dashboard` 
- Should render without crashes
- Authenticated user appears in header/badge
- No blank screen or React errors

### 5. Edge Case: API Down
- Stop the backend: `pm2 stop containeryard`
- Reload the page
- Expected: Error screen with "API health check failed - server may be offline" and Retry button
- NO crash, NO blank screen
- Click Retry after starting server: `pm2 start containeryard`

## Files Changed

```
client/src/lib/api.ts          - Fixed API_BASE init, added cache control, stabilized hook
client/src/lib/authBootstrap.ts - NEW: Non-fatal auth/health check utilities
client/src/App.tsx             - Use hardened bootstrap, removed API_BASE import
vite.config.ts                 - Enabled source maps
```

## Non-Goals (Unchanged)

- Backend cookie configuration remains the same
- `/api/*` routes and Nginx config unchanged
- No new global state libraries introduced
- Minimal patch surface area

## Related Issues

- React error #310: Too many re-renders / invalid hook call
- "Cannot access 'I' before initialization": TDZ from circular imports
- 304 Not Modified causing stale sessions in SPA
- App crashes during bootstrap when API is unreachable
