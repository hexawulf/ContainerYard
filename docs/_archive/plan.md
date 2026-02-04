# ContainerYard — Fix Empty piapps2 Containers & Broken Logs (DeepSeek Plan)

You are **DeepSeek (coding mode) running inside OpenCode CLI** on my Pi host.  
Your job: **fix ContainerYard so that**

1. **Pi Apps 2 (piapps2)** shows its containers correctly (no empty list).
2. **Logs** work for:
   - `piapps` containers (Docker)
   - `piapps2` containers (crypto-agent on piapps2)
   - Synology containers (via Dozzle link instead of red error).
3. The UI stops showing **“Error loading logs: Failed to fetch logs”** for valid containers.

Follow this plan step‑by‑step. Keep diffs minimal and safe.

---

## 0️⃣ Context & Guardrails (do not change)

- Host user: `zk`
- Repo root: `/home/zk/projects/ContainerYard`
- Runtime:
  - Backend: Node/Express + TypeScript (`server/` → `dist/`)
  - Frontend: React 18 + Vite + TS (`client/`)
  - Sessions & roles already implemented (`admin` / `viewer`)
- Port & domain (PROD):
  - **Internal port:** `5008`
  - **Public domain:** `https://container.piapps.dev` (and/or `https://containeryard.org` via Nginx)
- Related docs in repo root (read, don’t rewrite unless needed):
  - `AGENTS.md` (global rules & ports)
  - Any `AGENTS.*.md` under `client/` and `server/`
  - Previous prompts: monitoring + logs implementation docs (if present)

**Guardrails:**

- **Do NOT** change ports, PM2 names, or Nginx config.
- **Do NOT** expose Docker sockets over TCP.
- Use **absolute paths** in any shell commands you add to docs or comments.
- Reuse existing patterns for auth, logging, validation, and error handling.

---

## 1️⃣ Quick Orientation & Baseline

1. Go to repo root:

   ```bash
   cd /home/zk/projects/ContainerYard
   /usr/bin/git status
   ```

2. Install dependencies if needed:

   ```bash
   /usr/bin/pnpm install || /usr/bin/npm install
   ```

3. Skim **existing host/logs implementation**:

   - `server/src/config/hosts.ts` (or similar) — how `piapps`, `synology`, and `piapps2` are defined.
   - `server/src/services/*`:
     - Docker integration (Dockerode)
     - cAdvisor / Prometheus integrations
   - `server/src/routes/*containers*` and `server/src/routes/*logs*`:
     - `GET /api/hosts`
     - `GET /api/hosts/:hostId/containers`
     - `GET /api/hosts/:hostId/containers/:id`
     - `GET /api/hosts/:hostId/containers/:id/logs`
     - `GET /api/hostlogs/:name`
   - Client side:
     - Host & containers list components in `client/src/features/hosts` or similar.
     - Logs viewer components (`LogsViewer`, container details page).

4. Confirm there is a **Host model** (DB or in‑memory):

   - If Prisma/Drizzle: check `server/prisma/schema.prisma` or `server/src/db/schema.ts` for `Host` / `Stack` tables.
   - Understand how host IDs (`piapps`, `piapps2`, `synology`, `media-stack`, etc.) flow from DB → API → client.

5. Run the current tests/build just to ensure baseline:

   ```bash
   /usr/bin/pnpm run lint    || true
   /usr/bin/pnpm run test    || true
   /usr/bin/pnpm run build
   ```

   > Only fix tests that are clearly related to your changes; don’t embark on a huge unrelated cleanup.

---

## 2️⃣ Reproduce the Two Bugs (using logs & code)

You won’t have browser cookies here, but you can **infer failures from server logs and code paths.**

### 2.1 Capture server‑side errors

1. Check PM2 logs (prod instance):

   ```bash
   /usr/bin/pm2 logs containeryard --lines 200
   ```

2. Look specifically for errors around:

   - `GET /api/hosts/piapps2/containers`
   - `GET /api/hosts/piapps2/containers/:id/logs`
   - `GET /api/hosts/synology/containers/:id/logs`

   or any stack traces mentioning “logs”, “piapps2”, “synology”, “CADVISOR_ONLY”, “Dozzle”.

3. If there is a dedicated server log (e.g. `logs/containeryard*.log`), inspect that too.

### 2.2 Inspect client behavior

In the React code:

- Find the container list query hook, e.g. `useContainersQuery(hostId)`.
- Find the logs query hook, e.g. `useContainerLogsQuery({ hostId, containerId, ... })` or the component that calls the logs API.
- Confirm which **hostId strings** the client uses for:
  - “Pi Apps 2 (piapps2)”
  - “Synology” / “media‑stack”
- Confirm how the logs viewer interprets API responses and errors (does it expect plain text, NDJSON, SSE, JSON, or a `{ dozzleUrl }` object?).

Document the key findings in a short comment block or `DIAGNOSIS.md` (optional).

---

## 3️⃣ Fix #1 — Empty Container List for piapps2

**Goal:** When selecting **Pi Apps 2 (piapps2)** in the sidebar, the main containers list shows all crypto‑agent containers (like freqtrade, exporter, Prometheus, Grafana, cAdvisor, etc.), not an empty state.

### 3.1 Verify host configuration for piapps2

1. In `server/src/config/hosts.ts` (or equivalent):

   - Ensure there is an entry for `piapps2` with a clear `id` (e.g. `"piapps2"`), provider type, and any required URLs.

   Example (adapt; don’t blindly copy):

   ```ts
   export const HOSTS: HostConfig[] = [
     {
       id: "piapps",
       name: "Pi Apps",
       provider: "DOCKER",
       nodeLabel: "piapps",
       docker: { socketPath: "/var/run/docker.sock" },
     },
     {
       id: "piapps2",
       name: "Pi Apps 2",
       provider: "CADVISOR_ONLY", // or DOCKER_REMOTE, depending on how it's wired
       nodeLabel: "piapps2",
       cadvisor: { baseUrl: process.env.PIAPPS2_CADVISOR_URL! },
     },
     {
       id: "synology",
       name: "Synology",
       provider: "CADVISOR_ONLY",
       nodeLabel: "synology",
       cadvisor: { baseUrl: process.env.SYNOLOGY_CADVISOR_URL! },
       dozzleUrl: process.env.SYNOLOGY_DOZZLE_URL,
     },
   ];
   ```

2. Make sure the **client** uses the same `id` string (`"piapps2"`) when requesting containers & stacks.

   - If the DB stores `host.slug = "piapps-2"` but the client uses `"piapps2"`, normalize this so both sides agree.
   - Prefer not to change DB data in code; instead, normalize slugs to a stable hostId mapping in the server.

### 3.2 Align stack summary with containers source

Right now the host card for piapps2 shows “9 containers 9 running” but the actual containers list is empty. That suggests:

- The **summary** is driven by some metrics source (Prometheus / cAdvisor), but
- The **per‑container list** is querying a different source (or hostId doesn’t match).

Fix this by:

1. Tracing the code path that feeds the **left‑side host/stacks list**:
   - Which service(s) generate `stack.containerCount` and `stack.runningCount`?
   - From which host/provider type?

2. Tracing the code path for **`GET /api/hosts/:hostId/containers`**:
   - For `provider === "DOCKER"` it likely uses Dockerode.
   - For `provider === "CADVISOR_ONLY"` it may parse cAdvisor JSON/Prometheus metrics.

3. Ensure that for **`hostId = "piapps2"`**, the containers route uses the **same metrics source** as the stack summary does. If synology already works through cAdvisor, copy the pattern:

   - There should be a function like `listCadvisorContainers(hostConfig)` used for `provider: "CADVISOR_ONLY"`.
   - Confirm it is wired for both `synology` **and** `piapps2`.

4. Add tests or small unit checks if there are test helpers for container listing, but do not over-engineer.

### 3.3 Verify behavior

After changes:

```bash
cd /home/zk/projects/ContainerYard
/usr/bin/pnpm run build
/usr/bin/pm2 restart containeryard --update-env
/usr/bin/pm2 logs containeryard --lines 80
```

From a browser (user will do this part):

- Select **Pi Apps 2 (piapps2)** in the top host dropdown.
- Expand the `crypto-agent` stack.
- Confirm that **all containers** are listed (9 running, etc.), not empty.

---

## 4️⃣ Fix #2 — Logs Fail for Synology & piapps2

**Goal:**

- For **piapps** and **piapps2** containers, the logs tab should display real logs (tail, follow, grep, etc.) via the API.
- For **Synology** containers, the logs tab should show a **Dozzle link** instead of trying (and failing) to fetch logs, avoiding the red “Failed to fetch logs” error.

### 4.1 Server: normalize logs route behavior

1. Find the logs route(s), e.g.:

   - `server/src/routes/containerLogs.ts`
   - `server/src/routes/logs.ts`

2. Ensure consistent behavior based on `host.provider`:

   - `provider: "DOCKER"` → Use Dockerode with `container.logs(...)`:

     - Supports `tail`, `since`, `stdout`, `stderr`, `timestamps`, `grep`, and optional `follow`/SSE.

   - `provider: "CADVISOR_ONLY"` but with `dozzleUrl` (Synology):

     - Do **NOT** attempt to read logs.

     - Return a small JSON payload:

       ```ts
       res.json({ dozzleUrl: `${host.dozzleUrl}/containers/${encodeURIComponent(containerId)}` });
       ```

   - `provider: "CADVISOR_ONLY"` without `dozzleUrl` (e.g. piapps2, if that’s how we treat it):

     - Either:
       - Implement a **read-only logs view** via host file logs or cAdvisor container log endpoints, or
       - Explicitly respond with a 501 + JSON explaining that logs are not available for this host.
     - In either case, the client must handle it gracefully.

3. Harden input validation for this route using existing validation utilities (zod or hand-rolled):

   - `tail`: integer between 1 and 5000; default 500.
   - `since`: ISO timestamp or seconds; clamp to max lookback (e.g. 7 days).
   - `grep`: optional, limited length; tolerate invalid regex by falling back to substring match.

4. Ensure proper **HTTP status codes** and error shape:

   - 200 for successful text/logs/JSON responses.
   - 404 when container not found for that host.
   - 501 when logs are intentionally not supported for a host/provider.
   - 500 only for actual unexpected errors (with server-side logging).

### 4.2 Client: logs viewer behavior & Dozzle handoff

1. Find the logs viewer component (e.g. `client/src/components/LogsViewer.tsx` and its usage in container details).

2. Update it so that it can handle **three kinds of responses** cleanly:

   1. **Plain text / SSE logs** (piapps / piapps2):
      - Current behavior with tail & follow; keep as-is, but improve error display if needed.
   2. **`{ dozzleUrl }` JSON** (Synology):
      - When the response contains `dozzleUrl`, do **not** treat as an error.
      - Render a short message like “Logs for Synology are viewed via Dozzle” and a button **“Open in Dozzle”** that opens `dozzleUrl` in a new tab.
   3. **501 / not available** (if you choose this for piapps2):
      - Show a neutral message (no red error banner), e.g. “Live logs are not available for this host yet.”

3. The screenshot shows a red banner **“Error loading logs: Failed to fetch logs”**. Replace this with:

   - A clear status for genuine errors (network, 500, etc.), and
   - Gentle UX for “not supported” (Synology Dozzle redirect, or 501).

4. Ensure that when switching between hosts & containers, any **SSE / streaming connection is cleaned up** (unsubscribe, close EventSource/websocket), following the current React patterns.

### 4.3 Security & Limits

- Keep existing auth/role checks:
  - `viewer` can tail logs.
  - `admin` can additionally use any **download** endpoints (if implemented).
- Ensure CORS/CSRF/session middleware remains consistent for logs routes.
- Rate limit logs endpoints if there was already a limiter in place; respect that config (don’t loosen it).

### 4.4 Verify logs behavior

After changes and rebuild/restart:

1. Check server logs while accessing logs from UI:

   ```bash
   /usr/bin/pm2 logs containeryard --lines 120
   ```

2. Manual verification (will be done by user, but you can simulate):

   - **Pi Apps (piapps) host**:
     - Pick a Docker container (e.g. `containeryard`, `tabletamer`) and open Logs tab.
     - Expect logs text to appear; “Follow” works.
   - **Pi Apps 2 (piapps2)**:
     - Pick a crypto-agent container (e.g. `freqtrade-trade`, `prometheus`).
     - Expect logs text to appear or a clear “not available” message (no generic error).
   - **Synology (media-stack)**:
     - Pick `prowlarr` (as in screenshot).
     - Logs tab should **offer a Dozzle button** instead of failing with “Failed to fetch logs”.

---

## 5️⃣ Regression Checks & Clean-Up

1. Run existing tests & lint again:

   ```bash
   cd /home/zk/projects/ContainerYard
   /usr/bin/pnpm run lint    || true
   /usr/bin/pnpm run test    || true
   /usr/bin/pnpm run build
   ```

2. Ensure TypeScript is happy (no new `any` leaks or skipped checks).

3. Keep the diff tight:

   - Only touch the files needed for:
     - Host config
     - Container listing service for piapps2
     - Logs routes
     - Logs viewer / container details UI
   - Avoid refactoring tangential parts (metrics tiles, theme, auth UI, etc.).

4. If you introduced any new env vars (e.g. `PIAPPS2_CADVISOR_URL`, `SYNOLOGY_DOZZLE_URL`):

   - Add them to `.env.example` with safe placeholder values.
   - Update any relevant `AGENTS.md` notes very briefly.

5. Summarize your work in the final message (for the human reviewer):

   - Files changed
   - Short description of each change
   - How you verified behavior for:
     - piapps2 container list
     - Logs for piapps, piapps2, synology
   - Any follow-up suggestions (optional).

---

## 6️⃣ Definition of Done

The task is complete when:

1. **Pi Apps 2 (piapps2)** host shows its containers list (no longer empty) and counts match the summary (“9 containers 9 running” or equivalent).
2. Logs tab for:
   - piapps containers → shows live logs without errors.
   - piapps2 containers → shows live logs OR a clear “not supported” message (no generic error banner).
   - Synology containers → shows a Dozzle link instead of “Failed to fetch logs”.
3. `pnpm run build` succeeds with no TypeScript errors.
4. No ports, PM2 names, or Nginx configs were changed.
5. Docker sockets remain local‑only; no new TCP exposures were introduced.

Please follow this plan and implement the fixes now.
