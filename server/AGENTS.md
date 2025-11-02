# Server - Backend API

## Package Identity
Express.js backend for ContainerYard. Provides REST API for Docker container management, authentication, log streaming (WebSocket), and metrics export. Uses Prisma (PostgreSQL), Passport.js (session auth), and Dockerode (Docker API client).

## Setup & Run

```bash
# Install dependencies (from root)
npm install

# Generate Prisma client
npx prisma generate                    # Or npm run postinstall

# Database migrations (Prisma)
npm run db:push                        # Push schema to database

# Start dev server (client + server)
npm run dev                            # Server at http://localhost:5000

# Build server only
npm run build:server                   # Output: dist/index.js

# Start production server
npm run start                          # Runs dist/index.js

# Type checking (includes server)
npm run check

# Lint (includes server)
npm run lint
```

## Patterns & Conventions

### File Organization
```
server/
├── src/
│   ├── routes/              Express route handlers (grouped by resource)
│   │   ├── auth.ts          Authentication endpoints (/api/auth/*)
│   │   ├── hosts.ts         Container CRUD (/api/hosts/*)
│   │   ├── hostLogs.ts      Host log streaming (/api/host-logs/*)
│   │   └── logDownload.ts   Log download (/api/download/*)
│   ├── services/            Business logic (external API clients)
│   │   ├── docker.ts        Dockerode wrapper (container operations)
│   │   ├── cadvisor.ts      cAdvisor metrics client
│   │   └── dockerHostStats.ts  Docker host statistics
│   ├── middleware/          Express middleware
│   │   └── auth.ts          requireAuth, requireRole, rate limiters
│   ├── db/                  Database client
│   │   └── client.ts        Prisma client singleton
│   ├── config/              Configuration
│   │   └── env.ts           Environment variable validation
│   ├── lib/                 Utilities
│   │   └── errors.ts        Custom error classes
│   ├── models/              TypeScript types
│   │   └── containers.ts    Container-related types
│   ├── types/               Type definitions
│   │   └── zod.ts           Zod schemas for validation
│   ├── index.ts             Express app initialization
│   └── metrics.ts           Prometheus metrics
├── prisma/
│   └── schema.prisma        Database schema (User, SavedSearch)
├── tests/                   Server tests (currently minimal)
├── routes.ts                Centralized route registration
├── db.ts                    Database connection (legacy)
├── storage.ts               Session storage config
└── vite.ts                  Vite dev server integration
```

### Route Handler Pattern

**✅ DO: Use Express Router + Try/Catch + Zod Validation**
```typescript
// server/src/routes/auth.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { ZodError } from "zod";
import { loginSchema } from "../types/zod";
import { requireAuth } from "../middleware/auth";

const router = Router();

// POST /api/auth/login
router.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    // Business logic here
    const user = await prisma.user.findUnique({ where: { email } });
    // ...
    
    res.json({ success: true, user });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.flatten() });
    }
    next(error); // Pass to error handler
  }
});

// GET /api/auth/me (protected)
router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.session.user });
});

export default router;
```

**✅ DO: Register Routes in routes.ts**
```typescript
// server/routes.ts
import authRouter from "./src/routes/auth";
import hostsRouter from "./src/routes/hosts";

app.use("/api/auth", authRouter);
app.use("/api/hosts", hostsRouter);
```

**❌ DON'T: Define Routes Directly in index.ts**
```typescript
// Avoid - use separate route files
app.get("/api/containers", async (req, res) => { ... });
```

### Service Layer Pattern

**✅ DO: Encapsulate External APIs in Services**
```typescript
// server/src/services/docker.ts
import Dockerode from "dockerode";

const docker = new Dockerode(/* config */);

export async function listContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.map(transformContainer);
}

export async function startContainer(id: string) {
  const container = docker.getContainer(id);
  await container.start();
}

// server/src/routes/hosts.ts uses service
import { listContainers, startContainer } from "../services/docker";

router.get("/api/containers", async (req, res) => {
  const containers = await listContainers();
  res.json(containers);
});

router.post("/api/containers/:id/start", requireAuth, async (req, res) => {
  await startContainer(req.params.id);
  res.json({ success: true });
});
```

**❌ DON'T: Call External APIs Directly in Routes**
```typescript
// Avoid - route handler too complex
router.get("/api/containers", async (req, res) => {
  const docker = new Dockerode();
  const containers = await docker.listContainers();
  // Complex transformation logic here...
  res.json(containers);
});
```

### Middleware Pattern

**✅ DO: Chain Middleware for Auth + CSRF**
```typescript
// server/src/middleware/auth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) {
    return next();
  }
  return res.status(401).json({ message: "Authentication required" });
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

// Usage in routes
router.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  // Only admins can delete users
});
```

**✅ DO: Use Rate Limiters for Sensitive Endpoints**
```typescript
// server/src/middleware/auth.ts
import rateLimit from "express-rate-limit";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many login attempts. Please try again later.",
});

// Apply to login route
router.post("/login", loginRateLimiter, async (req, res) => { ... });
```

### Database Pattern (Prisma)

**✅ DO: Use Prisma Client Singleton**
```typescript
// server/src/db/client.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// server/src/routes/auth.ts
import { prisma } from "../db/client";

const user = await prisma.user.findUnique({ where: { email } });
```

**✅ DO: Define Schema in prisma/schema.prisma**
```prisma
// server/prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
}

enum Role {
  USER
  ADMIN
}
```

**✅ DO: Push Schema Changes to DB**
```bash
# Development: Push schema without migrations
npm run db:push

# Production: Use migrations
npx prisma migrate dev --name add_user_role
npx prisma migrate deploy
```

### Error Handling Pattern

**✅ DO: Use Try/Catch + next(error)**
```typescript
router.get("/api/containers/:id", async (req, res, next) => {
  try {
    const container = await getContainer(req.params.id);
    res.json(container);
  } catch (error) {
    next(error); // Pass to Express error handler
  }
});

// Global error handler in index.ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});
```

**✅ DO: Validate Requests with Zod**
```typescript
// server/src/types/zod.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// server/src/routes/auth.ts
try {
  const { email, password } = loginSchema.parse(req.body);
} catch (error) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid payload", issues: error.flatten() });
  }
}
```

### Session Pattern

**✅ DO: Use express-session with Secure Config**
```typescript
// server/src/index.ts
import session from "express-session";
import { env } from "./config/env";

app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.isProduction, // HTTPS only in production
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  store: sessionStore, // Use Redis in production (not MemoryStore)
}));
```

**✅ DO: Store Minimal User Data in Session**
```typescript
// server/src/models/containers.ts
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

// server/src/routes/auth.ts
req.session.user = {
  id: user.id,
  email: user.email,
  role: user.role,
};
```

## Touch Points / Key Files

**Entry & Config**
- `server/index.ts` - Express app setup, middleware, error handling
- `server/routes.ts` - Centralized route registration
- `server/src/config/env.ts` - Environment variable validation
- `server/vite.ts` - Vite dev server integration (dev mode only)

**Database**
- `server/prisma/schema.prisma` - Database schema (User, SavedSearch models)
- `server/src/db/client.ts` - Prisma client singleton
- `server/db.ts` - Legacy database connection (consider removing)

**Authentication**
- `server/src/routes/auth.ts` - Login, logout, CSRF, session endpoints
- `server/src/middleware/auth.ts` - requireAuth, requireRole, rate limiters
- `server/src/models/containers.ts` - SessionUser type definition

**Docker Integration**
- `server/src/services/docker.ts` - Dockerode wrapper (container CRUD, logs, exec)
- `server/src/services/cadvisor.ts` - cAdvisor metrics client
- `server/src/services/dockerHostStats.ts` - Docker host statistics

**API Routes**
- `server/src/routes/hosts.ts` - Container list, start/stop/restart, WebSocket logs
- `server/src/routes/hostLogs.ts` - Host-level log streaming (/var/log/*)
- `server/src/routes/logDownload.ts` - Download container logs as file

**Monitoring**
- `server/src/metrics.ts` - Prometheus metrics (http_requests_total, etc.)

## JIT Index Hints

```bash
# Find route definitions
rg -n "router\.(get|post|put|delete|patch)" server/src/routes

# Find middleware usage
rg -n "requireAuth|requireRole" server/src/routes

# Find service functions
rg -n "^export (async )?function " server/src/services

# Find Prisma queries
rg -n "prisma\.(user|savedSearch)\." server/src

# Find Zod schemas
rg -n "= z\." server/src/types

# Find session usage
rg -n "req\.session" server/src

# Find error handling
rg -n "next\(error\)" server/src

# Find WebSocket usage
rg -n "ws:|WebSocket" server/src
```

## Common Gotchas

1. **Prisma Client**: Must run `npx prisma generate` after schema changes. Happens automatically on `npm install` (postinstall script).
2. **Session Storage**: Uses MemoryStore by default (not production-ready). Use Redis for production (see `server/storage.ts`).
3. **CSRF Protection**: All non-GET requests require CSRF token. Client handles this automatically via `queryClient.ts`.
4. **Docker Provider**: Set `PROVIDER=MOCK` in `.env` if you don't have Docker daemon. Routes will return mock data.
5. **Path Aliases**: Server uses relative imports (no @/ alias). Only client has path aliases.
6. **ESM Imports**: Server is built as ESM (`type: "module"` in package.json). Use `import` syntax, not `require()`.
7. **Port Conflicts**: Dev server runs on port 5000 (default). Change via `PORT` env var if needed.
8. **Database URL**: `DATABASE_URL` must be set in `.env`. Format: `postgresql://user:password@localhost:5432/containeryard`.

## Pre-PR Checks

```bash
# Must pass before PR
npm run check                          # TypeScript type checking
npm run lint                           # ESLint
npm run build:server                   # esbuild production build

# Optional but recommended
npm run db:push                        # Ensure schema is up to date
npx prisma generate                    # Regenerate Prisma client
```

## Database Schema Quick Reference

**User Model** (server/prisma/schema.prisma)
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // bcrypt hashed
  role      Role     @default(USER)
  createdAt DateTime @default(now())
}

enum Role {
  USER
  ADMIN
}
```

**SavedSearch Model** (server/prisma/schema.prisma)
```prisma
model SavedSearch {
  id          String   @id @default(cuid())
  userId      String
  name        String
  query       String
  containerId String?
  createdAt   DateTime @default(now())
}
```

## API Response Patterns

**Success Response**
```typescript
res.json({ success: true, data: result });
// or
res.json(result); // For simple data
```

**Error Response**
```typescript
res.status(400).json({ message: "Invalid request" });
res.status(401).json({ message: "Authentication required" });
res.status(403).json({ message: "Insufficient permissions" });
res.status(404).json({ message: "Resource not found" });
res.status(500).json({ message: "Internal server error" });
```

**Validation Error (Zod)**
```typescript
// ZodError is automatically formatted
res.status(400).json({ 
  message: "Invalid payload", 
  issues: error.flatten() 
});
```

## WebSocket Pattern (Log Streaming)

**✅ DO: Use ws Library for WebSocket**
```typescript
// server/src/routes/hosts.ts
import WebSocket from "ws";

wss.on("connection", (ws: WebSocket, req: Request) => {
  const containerId = getContainerIdFromUrl(req.url);
  
  // Stream logs
  const logStream = docker.getContainer(containerId).logs({
    follow: true,
    stdout: true,
    stderr: true,
  });
  
  logStream.on("data", (chunk) => {
    ws.send(chunk.toString());
  });
  
  ws.on("close", () => {
    logStream.destroy();
  });
});
```

## Environment Variables

**Required**
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session encryption (min 32 chars)
- `PROVIDER` - Docker provider (`MOCK`, `SIMULATION`, `REMOTE`)

**Optional**
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (`development`, `production`)
- `DOCKER_HOST` - Docker API URL (for REMOTE provider)
- `DOCKER_AUTH_TOKEN` - Bearer token (for REMOTE provider)
- `ALLOWED_ORIGINS` - CORS origins (comma-separated)

**Example .env**
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/containeryard
SESSION_SECRET=your-secret-key-min-32-chars-long
PROVIDER=MOCK
NODE_ENV=development
PORT=5000
```
