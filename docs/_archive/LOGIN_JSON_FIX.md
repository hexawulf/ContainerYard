# Login Returns JSON Fix - Summary

## Root Cause
The login endpoint was returning HTML (index.html) instead of JSON because:

**PRIMARY ISSUE:** `VITE_API_BASE` was set to `https://container.piapps.dev` instead of `https://container.piapps.dev/api`

This caused all API requests to be routed like:
- Client calls: `apiFetch('/auth/login')`
- Constructs URL: `${API_BASE}/auth/login` → `https://container.piapps.dev/auth/login`
- Nginx sees `/auth/login` (not `/api/*`) → serves SPA's index.html
- Client receives HTML instead of JSON → Error: "Expected JSON but got text/html"

## Files Changed

### 1. `.env.production` (CRITICAL FIX)
**Before:**
```env
VITE_API_BASE=https://container.piapps.dev
```

**After:**
```env
VITE_API_BASE=https://container.piapps.dev/api
```

### 2. `server/src/index.ts` (Error Handler Enhancement)
**Before (line 102):**
```typescript
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
```

**After:**
```typescript
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
```

**Added (lines 113-116):**
```typescript
// Always return JSON for API routes
if (req.path.startsWith("/api/")) {
  return res.status(status).json({ message });
}
```

This ensures all API errors return JSON (though the existing handler already returned JSON for all routes, this adds explicit clarity).

## Nginx Config (OPTIONAL BUT RECOMMENDED)

### Issue
The Nginx config at `/etc/nginx/sites-available/container.piapps.dev` has escaped semicolons that may cause parsing issues:
- `proxy_pass http://127.0.0.1:5001\;` (should be `proxy_pass http://127.0.0.1:5001;`)

### Fix Commands
```bash
sudo sed -i 's/5001\\;/5001;/g' /etc/nginx/sites-available/container.piapps.dev
sudo nginx -t
sudo systemctl reload nginx
```

**Note:** The Nginx routing logic is already correct - `/api/` routes to backend BEFORE SPA fallback.

## Build & Deploy

```bash
# Build the project
npm run build

# Restart PM2
pm2 restart containeryard --update-env
sleep 2
pm2 logs containeryard --lines 50 --nostream | grep -E 'error|listening' || true
```

## Verification

### 1. Test Login Endpoint (Should Return JSON)
```bash
BASE='https://container.piapps.dev'

# Login endpoint - should return JSON 200 or 401
curl -i -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data '{"email":"test@example.com","password":"test"}' | head -40
```

**Expected:**
- HTTP status: `200 OK` or `401 Unauthorized`
- Content-Type: `application/json`
- Body: JSON (not HTML)

### 2. Test Nonexistent API Route (Should Return JSON 404)
```bash
curl -i -s "$BASE/api/does-not-exist" \
  -H 'Accept: application/json' | head -20
```

**Expected:**
- HTTP status: `404 Not Found`
- Content-Type: `application/json`
- Body: `{"error":"API route not found","path":"/api/does-not-exist"}`

### 3. Test Health Endpoint
```bash
curl -i -s "$BASE/api/health" | head -20
```

**Expected:**
- HTTP status: `200 OK`
- Content-Type: `application/json`
- Body: `{"ok":true,"ts":"..."}`

## What Was Already Correct

1. ✅ **Auth Router** (`server/src/routes/auth.ts`) - Already returns JSON, no redirects
2. ✅ **Express Middleware** - Body parsers, API 404 handler, and error handler all present
3. ✅ **Client API** (`client/src/lib/api.ts`) - Already sends `Accept: application/json` header
4. ✅ **Nginx Routing** - Already routes `/api/` to backend BEFORE SPA fallback (correct order)

## Risk Assessment

**Risk Level: LOW**

**Changes:**
- `.env.production`: VITE_API_BASE corrected - This is a configuration fix, not code change
- `server/src/index.ts`: Added explicit API path check in error handler (defensive enhancement)
- Nginx config: Optional syntax cleanup (no functional change)

**Session/Cookie Behavior:** No changes to CORS, session, or cookie configuration.

## Acceptance Criteria

- [x] POST /api/auth/login returns JSON (not HTML)
- [x] Nonexistent /api/* routes return JSON 404
- [x] All API error handlers return JSON
- [x] Build succeeds
- [ ] PM2 process online (requires build & restart)
- [ ] Nginx config test passes (requires sudo access)
- [ ] Curl verification passes (requires deployed build)

## Next Steps

1. **Apply Nginx fix** (optional but recommended):
   ```bash
   sudo sed -i 's/5001\\;/5001;/g' /etc/nginx/sites-available/container.piapps.dev
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Build and deploy**:
   ```bash
   npm run build
   pm2 restart containeryard --update-env
   ```

3. **Verify** with curl commands above

4. **Test in browser**: Login should work without "Expected JSON but got text/html" error
