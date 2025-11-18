# Install dependencies
npm install

# (Prisma client is generated via postinstall, but you can re-run if needed)
npm run postinstall

# Start dev servers (client + server; proxied on dev port)
npm run dev     # typically http://localhost:5000

# Type checking
npm run check   # TypeScript strict mode

# Linting
npm run lint    # ESLint (React Hooks rules enabled)

# Run E2E tests (Playwright)
npm run e2e

# Build for production (server + client + verification)
npm run build
Production on the Pi is run via PM2 using the built dist/ artifacts and a PORT from .env (currently bound to an internal port like 5008 and reverse-proxied by Nginx).

Codebase Layout (Mental Map)
client/ – React 18 + Vite UI

client/src/components/ – shadcn/ui + custom components

client/src/pages/ – top-level pages (dashboards, container views)

client/src/features/ – feature modules (hosts, containers, logs, terminal, etc.)

client/src/hooks/ – custom hooks (TanStack Query, auth, polling, etc.)

client/src/lib/ – client utilities, queryClient (CSRF handling, API wrapper)

server/ – Express backend

server/src/routes/ – REST API routes (/api/hosts, /api/logs, /api/auth, etc.)

server/src/services/ – Docker, cAdvisor, logs, terminal, metrics

server/src/middleware/ – auth, CSRF, rate limiting, security headers

server/src/db/ & server/prisma/ – Prisma client + schema & migrations

shared/ – shared types & Zod schemas

shared/schema.ts – validation schemas

shared/monitoring.ts – monitoring/util types and helpers

e2e/ – Playwright E2E tests (login, host/containers view, logs, etc.)

Before editing, open the nearest AGENTS.md in that subtree for more detailed rules.

Conventions & Quality Gates
Code Style
TypeScript strict mode is enabled.

React hooks must obey react-hooks/rules-of-hooks and react-hooks/exhaustive-deps.

No Prettier config; keep formatting consistent with existing code.

Prefer functional React components and hooks-based patterns (no new class components).

Follow existing naming conventions for files, routes, and React components.

Git & Branches
Default branch: main.

Conventional Commits required:

feat(logs): ...

fix(client): ...

refactor(server): ...

chore(deps): ...

docs: ...

Create feature branches from main when doing anything more than a trivial fix.

Pre-commit Hooks
Pre-commit hooks must pass before a change is considered done:

npm run lint

npx madge client/src --circular

Security & Secrets (Hard Rules)
Do not commit:

.env files

DB credentials, JWT/session secrets, API tokens

Docker auth tokens or host IP/passwords

Use .env.example as the template; keep only placeholders there.

Environment variables (non-exhaustive):

DATABASE_URL – Postgres connection string

SESSION_SECRET – strong random string

PROVIDER – MOCK / SIMULATION / REMOTE (controls Docker provider)

Any host-specific URLs (cAdvisor, Dozzle, Prometheus, etc.)

PII and auth:

User emails + password hashes live in Postgres (via Prisma).

Session data via express-session (MemoryStore in dev, Redis in production).

Never log plaintext passwords, tokens, or full session contents.

Do not weaken CSRF, auth checks, or CORS for convenience.

Docker access:

Docker is accessed via local UNIX socket (/var/run/docker.sock) only.

Never expose Docker over TCP.

ContainerYard is primarily read-only monitoring; don’t add destructive actions (start/stop/kill) unless explicitly requested.

Authentication & API Flow
High-level request/response flow:

React component → TanStack Query hook (client)

Hook → client/src/lib/queryClient.ts (apiRequest, handles CSRF + cookies)

API → Express route (server/src/routes/*.ts)

Route → service layer (server/src/services/*.ts for Docker, cAdvisor, logs, etc.)

Service → Dockerode & other integrations (cAdvisor, Prometheus, Prisma DB)

Data bubbles back to the component for display

Authentication:

Session-based auth (Passport.js + express-session).

CSRF tokens required for all mutations (POST/PUT/PATCH/DELETE).

Client uses AuthGate and useAuth() to guard routes.

When touching auth/CSRF:

Keep changes minimal and explicit.

Don’t introduce new unauthenticated endpoints without clear justification.

Preserve existing middleware ordering in Express.

“Definition of Done” for Changes
Before calling a task finished, ensure:

npm run check passes (TypeScript)

npm run lint passes (ESLint + hooks)

npm run build completes (server + client + checks)

No circular dependencies:

bash
Copy code
npx madge client/src --circular
For UX-affecting changes: manually test against the dev server (npm run dev).

No new secrets/credentials appear in the diff.

Optional but encouraged

npm run e2e when modifying user flows (hosts, container listing, logs, terminal).

Update docs (AGENTS.md, README, or feature docs) if you change commands, env vars, or routes.

JIT Index & Search Cheatsheet
Use these from the repo root to find relevant code instead of asking for full file dumps:

bash
Copy code
# React components
rg -n "^export (function|const) \\w+" client/src/components

# Page components
rg -n "^export" client/src/pages

# Custom hooks
rg -n "^export (function|const) use\\w+" client/src/hooks

# API routes
rg -n "router\\.(get|post|put|delete)" server/src/routes

# Services
rg -n "^export (function|const|class)" server/src/services

# Zod schemas
rg -n "= z\\." shared/

# Prisma models
rg -n "^model " server/prisma/schema.prisma

# E2E tests
find e2e -name "*.spec.ts"
Path aliases (from tsconfig.json):

@/* → client/src/* (frontend only)

@shared/* → shared/* (shared client/server types & schemas)

Use these aliases where appropriate; don’t invent new alias patterns.

Guardrails for Gemini (Important)
When acting on this repo:

Do not
Change public ports, Nginx mappings, or PM2 app names unless explicitly asked.

Introduce new listeners, background daemons, or cron jobs.

Upgrade major versions of React, Express, Prisma, etc. as a side effect of a small fix.

Expose new unauthenticated endpoints or bypass CSRF.

Loosen CORS or security headers to “just make it work”.

Do
Keep diffs as small and targeted as possible.

Reuse existing patterns and utilities (apiRequest, existing Zod schemas, hooks).

Add or adjust tests where they provide clear value and are not flaky.

Suggest documentation/AGENTS updates when commands or workflows change.

Comment non-obvious logic, especially in security-sensitive areas (auth, CSRF, Docker access).

If there are multiple possible designs, choose the simplest one that:

Matches the existing architecture and coding style.

Minimizes the new surface area (ports, dependencies, abstractions).

Typical Tasks You May Be Asked To Do
You may be asked to:

Fix “containers not showing” bugs (host detection, API wiring, query keys, null states).

Improve or debug logs/metrics views (SSE stability, pagination, filters).

Add safe read-only endpoints (new metrics aggregations, host-level stats) and corresponding UI.

Tighten auth/CSRF/security headers following existing patterns.

Improve error handling and empty-state UX for Hosts/Containers dashboards.

Write or adjust Playwright tests for:

Login / logout flows

Host selection

Container list & details views

Logs & terminal interactions (smoke-level)

Always start by:

Identifying relevant files via the JIT commands above.

Reading the closest AGENTS.md.
(If requested) creating or updating a small plan.md that outlines the steps you’ll take before editing many files.
