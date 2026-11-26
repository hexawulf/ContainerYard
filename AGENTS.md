# ContainerYard - Agent Guidelines

## Project Snapshot
Simple full-stack TypeScript project (not a monorepo). React 18 + Express.js + Prisma (SQLite by default, optional PostgreSQL). Docker container observability dashboard with real-time SSE log streaming, compose stack actions, and metrics.

## Root Setup Commands
```bash
# Install dependencies (also runs `prisma generate` via postinstall)
npm ci

# Start development server (client + server)
npm run dev                    # Available at http://localhost:5008

# Build everything
npm run build                  # Builds server (esbuild) + client (vite) + verification

# Type checking
npm run check                  # TypeScript compiler (app)
npm run check:tests            # TypeScript compiler (tests)

# Linting
npm run lint                   # ESLint

# Unit & integration tests
npm test                       # Unit tests (node:test)
npm run test:integration       # Live integration tests against CY_BASE_URL

# E2E tests
npm run e2e                    # Playwright tests

# Docker Compose (production)
docker compose up -d           # Pull/run 0xwulf/containeryard + redis on 127.0.0.1:5008
scripts/docker-deploy.sh 5.5.0 # Pull tagged release, backup cy-data DB, recreate & verify
```

## Universal Conventions

**Code Style**
- TypeScript strict mode enabled (`tsconfig.json`)
- ESLint with React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) and `@typescript-eslint/no-explicit-any` as an error
- No `any`: catch as `unknown` and read fields with `errorInfo()` / throw `HttpError` (`server/src/lib/httpError.ts`); client code uses `errorMessage()` (`client/src/lib/errors.ts`)
- No Prettier config (manual formatting)
- UI look and tokens: follow [docs/DESIGN_GUIDELINES.md](./docs/DESIGN_GUIDELINES.md)
- No pre-commit hooks (lefthook was removed in 5.1.0); CI runs typecheck, lint, unit tests and build on every push

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
- Required vars: `DATABASE_URL`, `SESSION_SECRET`, `REDIS_URL`, `ALLOWED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- Client-side vars: None currently (no VITE_* vars in production)

**PII Handling**
- User data stored in Prisma (SQLite by default; PostgreSQL optional): email, hashed passwords, `sessionVersion`, audit logs, bookmarks, saved searches
- Session data in `express-session` backed by Redis (`connect-redis`)

## JIT Index (What to Open, Not What to Paste)

### Directory Structure
```
ContainerYard/
├── client/          → Frontend (React 18 + Vite)
│   └── src/
│       ├── components/   UI components (shadcn/ui + custom)
│       ├── pages/        Page-level components
│       ├── features/     Feature modules
│       ├── hooks/        Custom React hooks
│       └── lib/          Client utilities (API, query client)
├── server/          → Backend (Express + Prisma)
│   ├── prisma/           Database schema, migrations & seed
│   └── src/
│       ├── config/       Validated env, hosts, Redis session config
│       ├── routes/       API route handlers
│       ├── services/     Business logic (Docker, cAdvisor, host logs)
│       └── middleware/   Auth, rate limiting, CSRF
├── shared/          → Shared types & schemas
│   ├── schema.ts         Drizzle/Zod schemas
│   └── monitoring.ts     Monitoring types
└── e2e/             → Playwright E2E tests
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
npx madge client/src --extensions ts,tsx --ts-config tsconfig.json --circular
```

### Path Aliases (tsconfig.json)
- `@/*` → `client/src/*` (frontend code only)
- `@shared/*` → `shared/*` (available in client & server)

## Definition of Done

**Before Creating a PR**
- [ ] `npm run check` passes (TypeScript)
- [ ] `npm run lint` passes (ESLint)
- [ ] `npm run build` succeeds (server + client)
- [ ] No circular dependencies: `npx madge client/src --extensions ts,tsx --ts-config tsconfig.json --circular`
- [ ] Manual testing completed (dev server)
- [ ] No secrets/credentials in committed files
- [ ] `npm run check:tests` and `npm test` pass (unit tests, server + client)

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
- Session-based auth with `express-session` + Redis (plus optional Google sign-in via Firebase Auth)
- CSRF tokens for all mutations (POST/PUT/PATCH/DELETE)
- Auth middleware: `requireAuth()`, `requireRole(...roles)`
- Client-side auth context: `AuthGate` component + `useAuth()` hook

**Key Integrations**
- Docker API via Dockerode (server/src/services/docker.ts)
- cAdvisor for container metrics (server/src/services/cadvisor.ts)
- Prometheus metrics export (server/src/metrics.ts)
- Server-Sent Events (SSE) for real-time container and host log streaming

## Common Gotchas

1. **CSRF Tokens**: All mutations require CSRF token. Use `apiRequest()` from `lib/queryClient.ts` (auto-handles CSRF).
2. **Path Aliases**: `@/` only works in client code. Server uses relative imports.
3. **Prisma Client**: Must run `npx prisma generate` after schema changes.
4. **Docker Socket**: Local Docker access uses `DOCKER_HOST` (default `unix:///var/run/docker.sock`); remote read-only hosts are configured via `CY_REMOTE_HOSTS`.
5. **Session Storage**: Requires Redis (`REDIS_URL`).
6. **Port Conflicts**: Dev server runs on port 5008. Change `PORT` in `.env` if needed.

## Quick Reference

**Key Files**
- Entry points: `server/index.ts`, `client/src/main.tsx`
- API client: `client/src/lib/queryClient.ts`
- Auth logic: `server/src/routes/auth.ts`, `client/src/components/AuthGate.tsx`
- Database schema: `server/prisma/schema.prisma`
- Config: `vite.config.ts`, `tsconfig.json`, `eslint.config.js`

**Tech Stack at a Glance**
- UI: React 18, shadcn/ui (Radix), Tailwind CSS v3, Wouter (routing)
- State: TanStack Query (server state), React Context (auth, theme)
- Backend: Express, Prisma, Redis (`connect-redis`), Dockerode
- Build: Vite (client), esbuild (server)
- Testing: `node:test` unit tests (`server/tests/unit`, `client/tests/unit`; Docker and cAdvisor are exercised against fake engines on a Unix socket / local HTTP port), live integration suite, Playwright E2E
