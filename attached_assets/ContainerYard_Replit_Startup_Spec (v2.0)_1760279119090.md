# ContainerYard v2.0 — Beyond Dozzle

*A pragmatic spec to kick off on Replit, focused purely on container logs, status visualization, and fast debugging.*

> Goal: ship a lightweight, fast, and opinionated container **observability & debugging UI** (logs + status + shell) that feels like Dozzle on its best day—but with killer additions that actually help you *debug faster*, not manage infrastructure.

------

## Principles

1. **Log-first UX:** everything orbits the live tail. Status exists to contextualize logs, not the other way around.
2. **No orchestration creep:** we show, search, segment, explain logs, and provide debugging access; we don't "manage clusters."
3. **Sub-10ms paint loop:** UI must feel instant while streaming.
4. **Replit-friendly:** clean monorepo, simple .env, simulation & mock providers so it runs without Docker.
5. **Debug-ready:** if you can't debug it quickly, it doesn't belong in production.

------

## What makes ContainerYard better than Dozzle?

> Additions are strictly about **visualizing logs, runtime status, and debugging**—no scheduling, no deploys.

### A. "Explain the Spike" (one-click context)

- **Correlation strip** above the log tail: CPU/Mem/Net mini-sparklines + container state markers (start/stop/health).
- Click a spike → **auto-scoped log window** (T-10s to T+20s) with pre-filled filters (e.g., `level:error OR "timeout"`) and a side panel highlighting status changes in that window.

### B. Structured log awareness (without forcing it)

- Detects JSON lines, exposes **ad-hoc field chips** (service, level, traceId).
- One click to pivot filters (e.g., `traceId=…`, `reqId=…`), and **pin** as a Saved View.
- **Smart level detection:** even for plain text logs, regex-match common patterns (`ERROR|WARN|INFO|DEBUG|FATAL`) and color-code + enable filtering.

### C. Regex/DSL search + snippets

- Ultra-fast filter bar with:
  - simple text,
  - **regex**, and
  - a tiny **query DSL** (`level:warn..error service:auth -"healthcheck"`).
- Save searches as **Snippets** (name + description) and rerun with a keystroke.

### D. Multi-source providers (so the UI never blocks)

- **MOCK / SIMULATION / REMOTE** providers toggleable at runtime: develop and demo anywhere; swap to real agents later.

### E. "Log Moments" & Bookmarks

- Press **M** to drop a timestamped "moment" with an optional note (e.g., "after hot-reload").
- **Shareable deep-links** (container + ts range + filters).

### F. Diff restarts & deployments (log-to-log compare)

- Visual "before vs after" compare for container restarts: aligns windows, highlights **new error patterns** and **rate deltas**.

### G. Heatmap & rate diagnostics

- Log rate **heatmap** per container with bucketing (e.g., 1s/5s).
- Auto-warns on **bursting** (Z-score on rolling window) and links directly to the offending time window.

### H. Tail ergonomics that matter

- **Sticky autoscroll** (never fights you).
- **Backfill** on reconnect with missing seconds.
- "Start of logs" jump & **byte offset** resume.

### I. Team-ready without RBAC bloat

- Optional Firebase Auth (Google/GitHub).
- **Per-user Saved Views** and **local-only Guest Mode** (no auth required for core features).

### J. **Shell/Exec Access** 🎯 NEW

- **WebSocket-based terminal** right in the UI using `xterm.js`.
- One-click `docker exec -it` into any running container.
- Full ANSI color support, responsive resizing.
- The #1 debugging action after viewing logs—no context switching.

### K. **Quick Actions** NEW

- Restart, Stop, Start, Remove—right from the container card.
- Confirmation modals for destructive actions.
- Real-time status updates via WebSocket.

### L. **Port Mappings with Click-to-Open** NEW

- Display exposed ports prominently (e.g., `80:8080`, `443:8443`).
- Click to open `http://localhost:8080` directly in a new tab.
- Massive time-saver for web services.

### M. **Health Check Status** NEW

- Surface Docker's native health checks prominently.
- States: healthy, unhealthy, starting, none configured.
- Display in container card and correlation strip.

### N. **Environment Variables Viewer** NEW

- Quick panel to view container env vars without exec-ing.
- Search/filter for large env lists.
- Useful for verifying configuration at a glance.

### O. **Dark Mode** 🌙 NEW

- System preference detection on first load.
- Toggle in header, persisted to localStorage.
- Essential for any developer tool.

### P. **Keyboard Shortcuts System** NEW

- Power-user navigation and control.
- Discoverable with `?` help overlay.
- Core shortcuts: `/` (search), `Esc` (clear), `Space` (pause), `M` (moment).

------

## MVP (3–4 day target)

### Core Features

1. **Container list** with name/image/state/uptime/health + quick resource pills (CPU/Mem/Net).
2. **Live log tail** with autoscroll, pause, search, smart level detection, and saved snippets.
3. **Stats strip** (mini CPU/Mem/Net graphs) synced to the log timeline (1s buckets).
4. **Correlation markers** (start/stop/health/restart) inside timeline.
5. **Providers:** `MOCK`, `SIMULATION`, `REMOTE` (agent). `REMOTE` uses bearer token; `ALLOWED_ORIGINS` enforced.
6. **Download current view** (filters + time-range → `.log` file).

### New MVP Additions (v2.0)

1. **Shell/Exec access** with `xterm.js` terminal in a tab/modal.
2. **Quick actions** (restart/stop/start) with confirmation modals.
3. **Port mappings** display with click-to-open links.
4. **Health check status** in container cards and timeline.
5. **Dark mode** with system preference detection.
6. **Keyboard shortcuts** (at minimum: `/`, `Esc`, `Space`, `M`, `?`).

> Nice-to-haves if time allows: log heatmap per container; one-click "Explain the Spike"; environment variables viewer.

------

## Stretch (post-MVP, still log/status/debug only)

- JSON field chips + pivots; advanced query DSL.
- Restart compare view (before/after).
- "Moments" bookmarks & deep links.
- Anomaly hints (burst detection, repeating error n-grams).
- Slack/Discord webhook for rate spikes (no paging system).
- **Multi-container log interleaving** (2-3 containers, color-coded side-by-side).
- **Volume mounts display** (useful for debugging path issues).
- **Network inspection** (which networks each container is on).
- **Image metadata panel** (size, created date, layers).
- **Container labels display** (service names, versions, etc.).
- **Command palette** (`Ctrl+K`) for power users.

------

## Architecture (Replit-friendly)

**Monorepo** with client/server + optional remote agent.

- **Client:** React 18 + Vite + Tailwind + shadcn/ui; TanStack Query; WebSocket client; Prism for highlight; **xterm.js** for terminal; **react-hotkeys-hook** for keyboard shortcuts.
- **Server:** Node/Express + Socket.io (or `ws`) + Zod validation; provider interface for MOCK/SIMULATION/REMOTE.
- **Agent:** Node on Pi/Synology; `dockerode` if socket present, CLI fallback otherwise. WebSocket for `docker logs -f` and exec sessions.

```
/ (Replit)
├─ .replit / replit.nix
├─ package.json
├─ .env.example
├─ client/
│  └─ src/
│     ├─ app/(routes)
│     ├─ components/
│     │  ├─ LogTail
│     │  ├─ TimelineStrip
│     │  ├─ ContainerCard
│     │  ├─ Terminal (new)
│     │  ├─ QuickActions (new)
│     │  ├─ PortLinks (new)
│     │  ├─ HealthBadge (new)
│     │  ├─ EnvVarsPanel (new)
│     │  ├─ KeyboardShortcutsHelp (new)
│     │  ├─ Heatmap
│     │  ├─ SearchBar
│     │  └─ SavedViews
│     ├─ lib/
│     │  ├─ api.ts
│     │  ├─ socket.ts
│     │  ├─ queryClient.ts
│     │  └─ shortcuts.ts (new)
│     ├─ hooks/
│     │  ├─ useTheme.ts (new)
│     │  └─ useKeyboardShortcuts.ts (new)
│     └─ types/
└─ server/
   └─ src/
      ├─ index.ts (http + ws)
      ├─ routes/
      │  ├─ containers.ts
      │  ├─ stats.ts
      │  ├─ actions.ts (new)
      │  └─ downloads.ts
      ├─ ws/
      │  ├─ logs.ts
      │  ├─ exec.ts (new)
      │  └─ stats.ts
      ├─ providers/
      │  ├─ mock.ts
      │  ├─ simulation.ts
      │  └─ remote.ts
      └─ middleware/
         ├─ auth.ts
         └─ cors.ts
```

------

## Endpoints & Sockets

**HTTP (server):**

- `GET /api/containers` → list with ports, health, env count
- `GET /api/containers/:id` → detailed info (new)
- `GET /api/containers/:id/stats?from=&to=` → series buckets
- `GET /api/containers/:id/env` → environment variables (new)
- `GET /api/containers/:id/download?from=&to=&q=` → filtered log export
- `POST /api/containers/:id/action` → `{action: 'start'|'stop'|'restart'|'remove'}` (new)
- `GET /healthz` → `{ ok: true }`

**WebSockets:**

- `WS /ws/logs?containerId=&from=` → live + optional backfill
- `WS /ws/exec?containerId=&cmd=` → interactive terminal session (new)
- `WS /ws/system` → provider status, heartbeats
- `WS /ws/stats?containerId=` → low-freq metrics for the timeline strip

**Agent (REMOTE provider):**

- `GET /containers` → list with full metadata
- `GET /containers/:id` → detailed container info
- `GET /containers/:id/stats`
- `GET /containers/:id/env` → environment variables
- `POST /containers/:id/:action` (`start|stop|restart|remove`)
- `WS /logs?containerId=` (tail)
- `WS /exec?containerId=&cmd=` (exec session)

> Token auth (`Authorization: Bearer …`) and strict CORS.

------

## UI Sketch (components that matter)

### LogTail

- Big, fast virtualized list; sticky autoscroll; pause/resume.
- Search bar with text/regex/DSL; pinned filters.
- Save as **Snippet**.
- Smart level detection and color-coding for plain text logs.
- Keyboard shortcut: `/` to focus search, `Esc` to clear, `Space` to pause/play.

### TimelineStrip

- Synchronized CPU/Mem/Net sparklines (1s buckets) with **event markers** (start/stop/health changes).
- Drag to select a window → LogTail scopes automatically.
- "Explain the Spike" button runs a heuristics query and opens a side panel.

### ContainerCard

- Name, image, state, uptime, **health badge**, quick resource pills.
- **Port mappings** with click-to-open links.
- **Quick actions** (restart/stop/start/remove) with hover tooltips.
- Click → focus container and show logs/terminal tabs.
- Secondary click → compare with previous restart.

### Terminal (new)

- Full `xterm.js` terminal with ANSI color support.
- Responsive resizing (cols/rows sent via WebSocket).
- Default command: `/bin/sh` (fallback to `/bin/bash` if available).
- Tab in container detail view (logs | terminal | env).

### EnvVarsPanel (new)

- Searchable/filterable list of environment variables.
- Displayed in a modal or side panel.
- Copy-to-clipboard for individual vars.

### KeyboardShortcutsHelp (new)

- Modal overlay triggered by `?`.
- Lists all available shortcuts with descriptions.
- Grouped by category (navigation, logs, actions).

### Heatmap (optional MVP, recommended stretch)

- 1s/5s buckets with hover → jump to time.
- Color intensity based on log rate.

### DarkModeToggle (new)

- Icon button in header (sun/moon).
- Persists preference to localStorage.
- Detects system preference on first visit.

------

## Data Model (server side)

```ts
type ContainerSummary = {
  id: string; 
  name: string; 
  image: string;
  state: 'running' | 'exited' | 'restarting' | 'paused';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'; // NEW
  startedAt?: string;
  cpuPct?: number; 
  memPct?: number; 
  netRx?: number; 
  netTx?: number;
  ports: PortMapping[]; // NEW
  envCount?: number; // NEW (count of env vars, not full list)
};

type PortMapping = { // NEW
  container: number;
  host: number;
  protocol: 'tcp' | 'udp';
};

type ContainerDetail = ContainerSummary & { // NEW
  created: string;
  command: string;
  mounts: VolumeMount[];
  networks: string[];
  labels: Record<string, string>;
};

type VolumeMount = { // NEW
  source: string;
  destination: string;
  mode: string;
};

type LogLine = {
  ts: string;            // ISO
  raw: string;           // original line
  level?: 'error' | 'warn' | 'info' | 'debug' | 'fatal'; // NEW (detected)
  meta?: Record<string, string | number | boolean>; // parsed fields if JSON
};

type EnvVar = { // NEW
  key: string;
  value: string;
};
```

### WebSocket Message Types (new)

```ts
// Exec/Terminal messages
type ExecMessage = 
  | { type: 'exec:start', containerId: string, cmd?: string[] }
  | { type: 'exec:data', sessionId: string, data: string }
  | { type: 'exec:resize', sessionId: string, cols: number, rows: number }
  | { type: 'exec:close', sessionId: string }
  | { type: 'exec:error', sessionId: string, error: string };

// Action messages
type ActionMessage = 
  | { type: 'action:request', containerId: string, action: 'start'|'stop'|'restart'|'remove' }
  | { type: 'action:success', containerId: string, action: string }
  | { type: 'action:error', containerId: string, action: string, error: string };

// Status update messages
type StatusMessage = 
  | { type: 'container:update', container: ContainerSummary }
  | { type: 'container:removed', containerId: string };
```

> If you want persistence for saved views and user prefs on Replit: PostgreSQL + Drizzle; Firebase Auth optional (core features work in guest mode).

------

## Environment (Replit & Agent)

**Dashboard / Server (.env):**

```
PORT=3000
PROVIDER=MOCK            # MOCK | SIMULATION | REMOTE
DASHBOARD_API_KEY=change-me
REMOTE_AGENT_URL=https://your-agent:8088
REMOTE_AGENT_TOKEN=change-me
ALLOWED_ORIGINS=https://<your-repl>.replit.dev,https://piapps.dev
```

**Optional (auth/persistence):**

```
DATABASE_URL=postgresql://...
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

> Keep tokens server-side; never expose Agent publicly without TLS.

**Agent (.env):**

```
PORT=8088
AGENT_TOKEN=change-me
DOCKER_SOCKET=/var/run/docker.sock
ALLOWED_ORIGINS=https://<your-repl>.replit.dev,https://containeryard.org
```

------

## Keyboard Shortcuts

| Shortcut | Action                                  |
| -------- | --------------------------------------- |
| `/`      | Focus search bar                        |
| `Esc`    | Clear filters / close modals            |
| `Space`  | Pause/resume log autoscroll             |
| `M`      | Drop moment bookmark                    |
| `?`      | Show keyboard shortcuts help            |
| `T`      | Toggle dark mode                        |
| `Ctrl+K` | Command palette (stretch)               |
| `1-9`    | Quick-switch between first 9 containers |

> Shortcuts are context-aware and don't interfere with text input.

------

## Dark Mode Implementation

- **System preference detection:** Check `prefers-color-scheme` on first load.
- **Manual toggle:** Icon button in header (sun/moon icon).
- **Persistence:** Save to `localStorage` as `theme: 'light' | 'dark' | 'system'`.
- **CSS:** Use Tailwind's `dark:` variant or CSS variables for theming.
- **Performance:** Avoid flash of unstyled content (FOUC) by reading localStorage before first paint.

```ts
// useTheme hook structure
const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  // Apply theme on mount and when changed
  // Return { theme, setTheme, effectiveTheme }
};
```

------

## "Replit freedom" notes (where the implementer can choose)

- **Sockets:** Socket.io vs native `ws`—pick one, just keep the interface.
- **Charts:** lightweight canvas (no heavy chart libs) vs simple SVG—opt for what's snappiest in Replit.
- **Simulation provider:** simple Markov states vs seeded deterministic scripts—either's fine; must persist within a session.
- **Search engine:** start with client-side filter; if logs get big, switch to stream-filter on server.
- **Styling:** Tailwind + shadcn/ui recommended, but minimal CSS is OK if speed demands it.
- **Terminal library:** `xterm.js` is standard, but any WebGL/Canvas-based terminal works if lighter.
- **Keyboard shortcuts:** `react-hotkeys-hook` vs native event listeners—choose based on complexity.

------

## Security Hygiene

- API key middleware for dashboard; bearer for Agent; strict CORS allowlist.
- Rate-limit actions (especially destructive ones like remove).
- **Exec sessions:** timeout after inactivity (e.g., 30 min); limit concurrent sessions per user.
- **Environment variables:** sensitive values (passwords, keys) should be masked in UI by default (show/hide toggle).
- Log who/when for all container actions.
- If enabling Firebase: verify ID tokens server-side.
- **Agent security:** never expose publicly; TLS required; token rotation recommended.

------

## Test Plan (fast)

- **MOCK:** spin up dashboard; verify list/log tail/search/autoscroll/terminal/dark mode.
- **SIMULATION:** flip provider; validate spikes + Explain flow + quick actions.
- **REMOTE:** run Agent on Pi; tail `nginx`, exec into container, start/stop/restart sanity checks.
- **Heat test:** push 5–10k lines/min; ensure UI remains smooth (virtualization).
- **Keyboard shortcuts:** verify all shortcuts work and don't conflict with browser defaults.
- **Dark mode:** toggle theme, refresh page, verify persistence.
- **Terminal:** exec into container, run commands, verify ANSI colors, resize terminal.
- **Actions:** restart container, verify logs resume correctly; stop/start cycle.

------

## Commands

**Server/dev:**

```bash
# root
npm install
npm run dev          # runs client + server concurrently
npm run build        # builds client; starts server
npm run typecheck    # validates TypeScript
```

**Agent (Pi/Synology):**

```bash
cd agent
npm install
npm start
```

**Development:**

```bash
# Quick provider switch (no restart)
curl -X POST http://localhost:3000/api/system/provider \
  -H "Authorization: Bearer <api-key>" \
  -d '{"provider": "SIMULATION"}'
```

------

## Definition of Done (MVP v2.0)

### Core Features

- Real-time tail with fast search, smart level detection + saved snippets.
- Correlation strip with status/metrics markers; click-to-scope.
- Providers: MOCK + REMOTE wired; SIMULATION optional if time.
- Basic download of filtered time-window.
- Secure by default (API key, origin allowlist).

### New v2.0 Features

- **Shell/exec access** working with xterm.js terminal.
- **Quick actions** (restart/stop/start) with confirmation modals.
- **Port mappings** displayed with click-to-open links.
- **Health check status** in container cards and timeline.
- **Dark mode** with system detection and persistence.
- **Keyboard shortcuts** (minimum: `/`, `Esc`, `Space`, `M`, `?`).

### Documentation

- Clear README with .env examples and one-click Replit run.
- Keyboard shortcuts documented in UI (`?` overlay).
- API documentation for agent endpoints.

------

## Future (still in scope of "visualization & debugging")

- Per-service **templates** (e.g., Nginx/MySQL/Node) to auto-highlight relevant fields.
- **TraceId stitching** if present in logs (zero infra changes).
- **Timeline compare** across multiple containers for a single incident window.
- **Log export with formatting** (HTML, Markdown, annotated).
- **Regex-based alerting** (local only, no external dependencies).
- **Container resource limits** display (CPU/Mem limits vs usage).
- **Image vulnerability scanning** (integrate with Trivy or similar).
- **Multi-container log interleaving** with color-coding.
- **Command history** in terminal (persisted per container).
- **Copy log lines** with context (surrounding lines + metadata).

------

## New Dependencies (v2.0)

**Client:**

```json
{
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "xterm-addon-web-links": "^0.9.0",
  "react-hotkeys-hook": "^4.5.0"
}
```

**Server:**

```json
{
  "dockerode": "^4.0.0",
  "node-pty": "^1.0.0"
}
```

> `node-pty` may require native compilation; consider fallback to `child_process.spawn` for Replit compatibility.

------

## Implementation Priority (v2.0)

### Phase 1 (Days 1-2): Foundation + Core

1. Original MVP features (logs, stats, providers)
2. Dark mode
3. Keyboard shortcuts framework
4. Port mappings display

### Phase 2 (Days 3-4): Debugging Power

1. Shell/exec access (terminal)
2. Quick actions with confirmations
3. Health check status
4. Smart log level detection

### Phase 3 (Stretch): Polish

1. Environment variables viewer
2. Heatmap
3. "Explain the Spike"
4. Command palette

------

**Project Name:** ContainerYard v2.0
 **By:** 0xWulf (🐺)
 **Tagline:** *Logs that actually help you debug.*
 **Domain:** containeryard.org

> You've got this, 0xWulf. Keep it lean, ship the debugging UX first (logs + terminal), and let everything else earn its place. The name is perfect, the domain is perfect, now make the tool perfect. 🚀

------

## Change Log (v2.0)

### Added

- Shell/exec access with xterm.js terminal
- Quick actions (restart/stop/start/remove)
- Port mappings with click-to-open
- Health check status display
- Environment variables viewer
- Dark mode with system preference detection
- Comprehensive keyboard shortcuts system
- Smart log level detection for plain text logs
- WebSocket message types for exec and actions
- Enhanced data models (ports, health, env)
- Security considerations for exec sessions

### Enhanced

- Container cards now show ports, health, and quick actions
- Log tail with smart level detection and color-coding
- Architecture diagram with new components
- Provider interface to support new features
- Test plan to cover new functionality

### Clarified

- Authentication scope (optional, guest mode available)
- Provider switching (runtime toggleable via API)
- Metrics update frequency (1s buckets, 5s for slow connections)
- Implementation priority and phasing

### Recommended for Stretch

- Multi-container log interleaving
- Volume mounts and network inspection
- Image metadata panel
- Container labels display
- Command palette (Ctrl+K)