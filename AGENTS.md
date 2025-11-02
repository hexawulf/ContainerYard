# ContainerYard - Agent Guidelines

## Project Snapshot
Simple full-stack TypeScript project (not a monorepo). React 18 + Express.js + Prisma (PostgreSQL). Docker container observability dashboard with real-time log streaming, metrics, and terminal access. Sub-directories have detailed AGENTS.md files for specific guidance.

## Root Setup Commands
```bash
# Install dependencies
npm install

# Generate Prisma client (runs automatically after install)
npm run postinstall

# Start development server (client + server)
npm run dev                    # Available at http://localhost:5000

# Build everything
npm run build                  # Builds server (esbuild) + client (vite) + verification

# Type checking
npm run check                  # TypeScript compiler

# Linting
npm run lint                   # ESLint

# E2E tests
npm run e2e                    # Playwright tests
```

## Universal Conventions

**Code Style**
- TypeScript strict mode enabled (`tsconfig.json`)
- ESLint with React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`)
- No Prettier config (manual formatting)
- Pre-commit hooks: lint + circular dependency check (lefthook.yml)

**Commit Format**
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Examples from git log:
  - `feat(logs): show Grafana/Prometheus logs from /var/log/*`
  - `fix(client): resolve React hooks exhaustive-deps warnings`

**Branch Strategy**
- Main branch: `main` (see git symbolic-ref output)
- Feature branches: create from main

**PR Requirements**
- Pre-commit checks must pass: `npm run lint` + madge circular check
- TypeScript must compile: `npm run check`
- Build must succeed: `npm run build`

## Security & Secrets

**Never Commit**
- `.env` files (use `.env.example` template)
- Database credentials, API tokens, session secrets
- Docker auth tokens

**Environment Variables**
- Copy `.env.example` to `.env` for local development
- Required vars: `DATABASE_URL`, `SESSION_SECRET`, `PROVIDER` (MOCK/SIMULATION/REMOTE)
- Client-side vars: None currently (no VITE_* vars in production)

**PII Handling**
- User data stored in Prisma (PostgreSQL): email, hashed passwords
- Session data in express-session (MemoryStore or Redis)

## JIT Index (What to Open, Not What to Paste)

### Directory Structure
```
ContainerYard/
├── client/          → Frontend (React 18 + Vite) [see client/AGENTS.md]
│   └── src/
│       ├── components/   UI components (shadcn/ui + custom)
│       ├── pages/        Page-level components
│       ├── features/     Feature modules
│       ├── hooks/        Custom React hooks
│       └── lib/          Client utilities (API, query client)
├── server/          → Backend (Express + Prisma) [see server/AGENTS.md]
│   └── src/
│       ├── routes/       API route handlers
│       ├── services/     Business logic (Docker, cAdvisor)
│       ├── middleware/   Auth, rate limiting, CSRF
│       ├── db/           Database client
│       └── prisma/       Database schema & migrations
├── shared/          → Shared types & schemas [see shared/AGENTS.md]
│   ├── schema.ts         Zod validation schemas
│   └── monitoring.ts     Monitoring utilities
└── e2e/             → Playwright E2E tests [see e2e/AGENTS.md]
```

### Quick Find Commands
```bash
# Find a React component
rg -n "^export (function|const) \w+" client/src/components

# Find a page component
rg -n "^export" client/src/pages

# Find an API route
rg -n "router\.(get|post|put|delete)" server/src/routes

# Find a custom hook
rg -n "^export (function|const) use\w+" client/src/hooks

# Find a service method
rg -n "^export (function|const|class)" server/src/services

# Find Zod schemas
rg -n "= z\." shared/

# Find Prisma models
rg -n "^model " server/prisma/schema.prisma

# Find E2E tests
find e2e -name "*.spec.ts"

# Check for circular dependencies
npx madge client/src --circular
```

### Path Aliases (tsconfig.json)
- `@/*` → `client/src/*` (frontend code only)
- `@shared/*` → `shared/*` (available in client & server)

## Definition of Done

**Before Creating a PR**
- [ ] `npm run check` passes (TypeScript)
- [ ] `npm run lint` passes (ESLint)
- [ ] `npm run build` succeeds (server + client)
- [ ] No circular dependencies: `npx madge client/src --circular`
- [ ] Manual testing completed (dev server)
- [ ] No secrets/credentials in committed files
- [ ] Git pre-commit hooks passed

**Optional but Recommended**
- [ ] `npm run e2e` passes (if modifying user flows)
- [ ] Updated relevant documentation (if adding features)

## Architecture Overview

**Frontend → Backend Flow**
1. React component → TanStack Query hook
2. Query hook → `queryClient.ts` (CSRF token handling)
3. API request → Express route handler
4. Route handler → Service layer (Docker, cAdvisor, etc.)
5. Service → External API (Dockerode, HTTP) or Database (Prisma)
6. Response ← Service ← Route ← Query ← Component

**Authentication Flow**
- Session-based auth with Passport.js
- CSRF tokens for all mutations (POST/PUT/PATCH/DELETE)
- Auth middleware: `requireAuth()`, `requireRole(...roles)`
- Client-side auth context: `AuthGate` component + `useAuth()` hook

**Key Integrations**
- Docker API via Dockerode (server/src/services/docker.ts)
- cAdvisor for container metrics (server/src/services/cadvisor.ts)
- Prometheus metrics export (server/src/metrics.ts)
- WebSocket for real-time log streaming
- xterm.js for web-based terminal

## Common Gotchas

1. **CSRF Tokens**: All mutations require CSRF token. Use `apiRequest()` from `lib/queryClient.ts` (auto-handles CSRF).
2. **Path Aliases**: `@/` only works in client code. Server uses relative imports.
3. **Prisma Client**: Must run `npx prisma generate` after schema changes.
4. **Docker Provider**: Set `PROVIDER=MOCK` in `.env` if you don't have Docker daemon.
5. **Session Storage**: Uses MemoryStore by default (not production-ready). Use Redis for production.
6. **Port Conflicts**: Dev server runs on port 5000. Change in `.env` if needed.

## Quick Reference

**Key Files**
- Entry points: `server/index.ts`, `client/src/main.tsx`
- API client: `client/src/lib/queryClient.ts`
- Auth logic: `server/src/routes/auth.ts`, `client/src/components/AuthGate.tsx`
- Database schema: `server/prisma/schema.prisma`
- Config: `vite.config.ts`, `tsconfig.json`, `eslint.config.js`

**Tech Stack at a Glance**
- UI: React 18, shadcn/ui (Radix), Tailwind CSS v4, Wouter (routing)
- State: TanStack Query (server state), React Context (auth, theme)
- Backend: Express, Prisma, Passport, Dockerode
- Build: Vite (client), esbuild (server)
- Testing: Playwright (E2E only, no unit tests yet)
