# ContainerYard - Claude Code Guidelines

## Project Overview

ContainerYard is a Docker container observability dashboard built with TypeScript full-stack (React 18 + Express.js + Prisma with PostgreSQL). It provides real-time log streaming, metrics visualization, and web-based terminal access to containers.

**Architecture**: Simple full-stack project (not a monorepo) with clear separation between client, server, shared types, and E2E tests.

**Production Deployment**: PM2 runs the built `dist/` artifacts on an internal port (e.g., 5008), reverse-proxied by Nginx. See PM2 config and Nginx site configs for details.

## Essential Commands

```bash
# Install dependencies
npm install

# Generate Prisma client (runs automatically via postinstall)
npm run postinstall

# Start development server (client + server on http://localhost:5000)
npm run dev

# Type checking (TypeScript strict mode)
npm run check

# Linting (ESLint with React Hooks rules)
npm run lint

# E2E testing (Playwright)
npm run e2e

# Build for production (server + client + verification)
npm run build

# Check for circular dependencies
npx madge client/src --circular
```

## Codebase Structure

```
ContainerYard/
├── client/                    # Frontend (React 18 + Vite)
│   └── src/
│       ├── components/        # UI components (shadcn/ui + custom)
│       ├── pages/             # Top-level page components
│       ├── features/          # Feature modules (hosts, containers, logs, terminal, etc.)
│       ├── hooks/             # Custom React hooks
│       └── lib/               # Client utilities (API layer, query client)
├── server/                    # Backend (Express + Prisma)
│   └── src/
│       ├── routes/            # REST API handlers (/api/hosts, /api/logs, /api/auth, etc.)
│       ├── services/          # Business logic (Docker, cAdvisor, logs, terminal, metrics)
│       ├── middleware/        # Auth, CSRF, rate limiting, security headers
│       ├── db/                # Database client configuration
│       └── prisma/            # Database schema & migrations
├── shared/                    # Shared types & schemas
│   ├── schema.ts              # Zod validation schemas
│   └── monitoring.ts          # Monitoring/util types and helpers
└── e2e/                       # Playwright E2E tests
    └── *.spec.ts              # Login, host/container views, logs, terminal tests
```

## Universal Conventions

### Code Style & Quality
- **TypeScript**: Strict mode enabled (`tsconfig.json`)
- **ESLint**: React Hooks rules enforced (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`)
- **Formatting**: No Prettier config; maintain consistency with existing code
- **React Patterns**: Functional components and hooks only (no new class components)
- **File Naming**: Follow existing conventions for components, routes, and utilities

### Git Workflow
- **Default Branch**: `main`
- **Branch Strategy**: Create feature branches from main for non-trivial changes
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`, etc.)
  - Examples: `feat(logs): show Grafana logs`, `fix(client): resolve hooks warnings`

### Pre-commit Requirements
- `npm run lint` passes
- `npx madge client/src --circular` passes (no circular dependencies)
- Git hooks run automatically via lefthook

## Security & Secrets (Hard Rules)

**Never Commit:**
- `.env` files or environment-specific configs
- Database credentials, JWT/session secrets, API tokens
- Docker auth tokens or host IP/passwords
- Any production secrets or credentials

**Environment Variables:**
- Copy `.env.example` to `.env` for local development
- Required: `DATABASE_URL`, `SESSION_SECRET`, `PROVIDER` (MOCK/SIMULATION/REMOTE)
- Host-specific URLs for cAdvisor, Dozzle, Prometheus, etc.

**Authentication & PII:**
- User emails + password hashes stored in PostgreSQL via Prisma
- Session data via express-session (MemoryStore in dev, Redis in production)
- Never log plaintext passwords, tokens, or full session contents
- Never weaken CSRF, auth checks, or CORS for convenience

**Docker Access:**
- Docker accessed via local UNIX socket (`/var/run/docker.sock`) only
- Never expose Docker over TCP
- ContainerYard is primarily read-only monitoring; don't add destructive actions (start/stop/kill) unless explicitly requested

## Architecture & Data Flow

### Frontend → Backend Flow
1. React component calls TanStack Query hook
2. Hook uses `apiRequest()` from `client/src/lib/queryClient.ts` (auto-handles CSRF + cookies)
3. API request hits Express route in `server/src/routes/`
4. Route handler delegates to service layer (`server/src/services/`)
5. Service interacts with Dockerode, cAdvisor, Prometheus, or Prisma DB
6. Response bubbles back through the chain to the component

### Authentication Flow
- Session-based auth with Passport.js + express-session
- CSRF tokens required for all mutations (POST/PUT/PATCH/DELETE)
- Client uses `AuthGate` component + `useAuth()` hook for route protection
- Auth middleware: `requireAuth()`, `requireRole(...roles)`

### Key Integrations
- **Docker API**: Dockerode (`server/src/services/docker.ts`)
- **Container Metrics**: cAdvisor (`server/src/services/cadvisor.ts`)
- **System Metrics**: Prometheus export (`server/src/metrics.ts`)
- **Real-time Logs**: Server-Sent Events (SSE)
- **Web Terminal**: xterm.js + WebSocket

## JIT Code Search (Command Reference)

Use these commands from the repo root to find relevant code:

```bash
# React components
rg -n "^export (function|const) \w+" client/src/components

# Page components
rg -n "^export" client/src/pages

# Custom hooks
rg -n "^export (function|const) use\w+" client/src/hooks

# API routes
rg -n "router\.(get|post|put|delete)" server/src/routes

# Service methods
rg -n "^export (function|const|class)" server/src/services

# Zod validation schemas
rg -n "= z\." shared/

# Prisma database models
rg -n "^model " server/prisma/schema.prisma

# E2E test files
find e2e -name "*.spec.ts"
```

### Path Aliases (from tsconfig.json)
- `@/*` → `client/src/*` (frontend code only)
- `@shared/*` → `shared/*` (available in both client and server)
- Use these aliases; don't invent new patterns

## Definition of Done

Before marking a task complete or creating a PR:

- [ ] `npm run check` passes (TypeScript compilation)
- [ ] `npm run lint` passes (ESLint with no warnings)
- [ ] `npm run build` succeeds (full production build)
- [ ] No circular dependencies (`npx madge client/src --circular`)
- [ ] Manual testing completed on dev server (`npm run dev`)
- [ ] No secrets or credentials in committed files
- [ ] Git pre-commit hooks pass

**Optional but Recommended:**
- [ ] `npm run e2e` passes (if modifying user flows)
- [ ] Relevant documentation updated (AGENTS.md, README, etc.)

## Common Gotchas

1. **CSRF Tokens**: All mutations require CSRF tokens. Always use `apiRequest()` from `lib/queryClient.ts` - it auto-handles CSRF tokens.

2. **Path Aliases**: `@/` only works in client code. Server uses relative imports. Don't mix them up.

3. **Prisma Client**: Must run `npx prisma generate` after changing `schema.prisma`.

4. **Docker Provider**: Set `PROVIDER=MOCK` in `.env` if you don't have Docker daemon available locally.

5. **Session Storage**: Uses MemoryStore by default (resets on server restart). Use Redis for production.

6. **Port Conflicts**: Dev server runs on port 5000. Update `.env` if you have conflicts.

7. **API Proxy**: In development, Vite proxies `/api` requests to the Express server automatically.

## Guardrails for Claude Code

### Do
- Keep diffs small and targeted - one logical change at a time
- Reuse existing patterns and utilities (`apiRequest`, Zod schemas, hooks)
- Add or adjust tests where they provide clear value
- Suggest documentation updates when commands or workflows change
- Comment non-obvious logic, especially in security-sensitive areas (auth, CSRF, Docker access)
- Choose the simplest design that matches existing architecture and minimizes new surface area
- Use the TodoWrite tool for multi-step tasks (3+ steps)
- Use Task tool with subagent_type=Explore for open-ended codebase exploration
- Use parallel tool calls when operations are independent

### Do NOT
- Change public ports, Nginx mappings, or PM2 app names without explicit request
- Introduce new listeners, background daemons, or cron jobs without discussion
- Upgrade major versions of React, Express, Prisma, etc. as a side effect
- Expose new unauthenticated endpoints or bypass CSRF checks
- Weaken CORS or security headers to "just make it work"
- Use bash commands for file operations when dedicated tools exist (Read, Edit, Write, Grep, Glob)
- Create new files unless absolutely necessary - prefer editing existing files
- Write markdown files or documentation proactively unless explicitly requested

## Key Files Reference

**Entry Points:**
- `server/index.ts` - Express server entry
- `client/src/main.tsx` - React app entry

**Core API Layer:**
- `client/src/lib/queryClient.ts` - API client with CSRF handling

**Authentication:**
- `server/src/routes/auth.ts` - Login/logout endpoints
- `client/src/components/AuthGate.tsx` - Route protection

**Configuration:**
- `server/prisma/schema.prisma` - Database schema
- `vite.config.ts` - Frontend build config
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - Linting rules

## Typical Tasks

You may be asked to:

- Fix "containers not showing" bugs (host detection, API wiring, query keys, null states)
- Improve or debug logs/metrics views (SSE stability, pagination, filters)
- Add safe read-only endpoints (new metrics aggregations, host-level stats) and corresponding UI
- Tighten auth/CSRF/security headers following existing patterns
- Improve error handling and empty-state UX for Hosts/Containers dashboards
- Write or adjust Playwright tests for login/logout, host selection, container views, logs, terminal

When starting any task:
1. Use the JIT commands above to identify relevant files
2. Read the nearest AGENTS.md for subtree-specific guidance
3. Create a plan.md if you're making changes across multiple files (optional but helpful)
4. Use TodoWrite to track multi-step tasks

## Tech Stack Summary

- **UI**: React 18, shadcn/ui (Radix), Tailwind CSS v4, Wouter (routing)
- **State**: TanStack Query (server state), React Context (auth, theme)
- **Backend**: Express, Prisma ORM, Passport.js, Dockerode
- **Build**: Vite (client), esbuild (server)
- **Testing**: Playwright (E2E only)
- **Database**: PostgreSQL
- **Session**: express-session (MemoryStore dev, Redis prod)
