# Shared - Common Types & Schemas

## Package Identity
Shared TypeScript types and Zod validation schemas used by both client and server. Ensures type safety and consistency across the full stack.

## Usage

**Import from @shared/ Alias**
```typescript
// Available in both client and server (tsconfig.json)
import { ContainerStatus, MonitoringConfig } from "@shared/schema";
import { cpuMetrics, memoryMetrics } from "@shared/monitoring";
```

## File Organization
```
shared/
├── schema.ts       Zod schemas + inferred TypeScript types
└── monitoring.ts   Monitoring utilities & metric helpers
```

## Patterns & Conventions

### Zod Schema Pattern

**✅ DO: Define Schema First, Then Infer Type**
```typescript
// shared/schema.ts
import { z } from "zod";

// 1. Define Zod schema
export const containerSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "stopped", "paused", "restarting"]),
  image: z.string(),
  created: z.number(),
  ports: z.array(z.object({
    private: z.number(),
    public: z.number().optional(),
    type: z.enum(["tcp", "udp"]),
  })),
});

// 2. Infer TypeScript type from schema
export type Container = z.infer<typeof containerSchema>;

// 3. Use in both client and server
// Server: validate incoming data
const validated = containerSchema.parse(rawData);

// Client: TypeScript type checking
const container: Container = { id: "123", name: "app", ... };
```

**✅ DO: Export Both Schema and Type**
```typescript
// shared/schema.ts
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["USER", "ADMIN"]),
});

export type User = z.infer<typeof userSchema>;

// Usage in server
import { userSchema, type User } from "@shared/schema";

// Usage in client
import type { User } from "@shared/schema"; // Type-only import
```

**❌ DON'T: Define Types Separately from Schemas**
```typescript
// Avoid - leads to drift between validation and types
export const userSchema = z.object({ ... });

// Separate type definition (bad)
export interface User {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
}
```

### Enum vs Union Types

**✅ DO: Use z.enum() for String Literals**
```typescript
// shared/schema.ts
export const containerStatusSchema = z.enum([
  "running", 
  "stopped", 
  "paused", 
  "restarting"
]);

export type ContainerStatus = z.infer<typeof containerStatusSchema>;
// Type: "running" | "stopped" | "paused" | "restarting"
```

**✅ DO: Use Prisma Enums for Database Models**
```typescript
// server/prisma/schema.prisma
enum Role {
  USER
  ADMIN
}

// shared/schema.ts (sync with Prisma)
export const roleSchema = z.enum(["USER", "ADMIN"]);
export type Role = z.infer<typeof roleSchema>;
```

### Validation vs Type-Only Imports

**✅ DO: Import Schema for Validation (Server)**
```typescript
// server/src/routes/auth.ts
import { loginSchema } from "@shared/schema";

router.post("/login", async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    // Validation happens here
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid payload" });
    }
  }
});
```

**✅ DO: Import Type-Only in Client (No Validation)**
```typescript
// client/src/pages/Dashboard.tsx
import type { Container, ContainerStatus } from "@shared/schema";

// Type checking only, no runtime validation
const containers: Container[] = await fetchContainers();
```

**❌ DON'T: Validate in Client (Unless Required)**
```typescript
// Avoid - client should trust server responses
import { containerSchema } from "@shared/schema";
const validated = containerSchema.parse(response.data); // Unnecessary
```

## Touch Points / Key Files

**Schemas** (shared/schema.ts)
- `containerSchema` - Container object structure
- `containerStatusSchema` - Container status enum
- `loginSchema` - Login request validation
- `userSchema` - User object structure
- `savedSearchSchema` - Saved search object
- `logEntrySchema` - Log entry structure

**Monitoring** (shared/monitoring.ts)
- `cpuMetrics()` - CPU usage calculations
- `memoryMetrics()` - Memory usage calculations
- `MonitoringConfig` - Monitoring configuration type

## JIT Index Hints

```bash
# Find all Zod schemas
rg -n "= z\." shared/

# Find exported types
rg -n "^export (type|interface)" shared/

# Find schema usage (validation)
rg -n "import.*Schema.*from ['\"]@shared" server/src client/src

# Find type-only imports
rg -n "import type.*from ['\"]@shared" client/src server/src
```

## Common Gotchas

1. **Drift Between Prisma and Zod**: Keep Prisma enums in sync with Zod schemas manually (no auto-sync).
2. **Circular Dependencies**: Avoid importing server code in shared (keep shared independent).
3. **Type-Only Imports**: Use `import type { ... }` in client to avoid bundling Zod runtime in production.
4. **Schema Composition**: Use `z.object().extend()` to compose schemas, not type-level intersections.
5. **Optional vs Nullable**: Use `.optional()` for `T | undefined`, `.nullable()` for `T | null`, `.nullish()` for both.

## Pre-PR Checks

```bash
# Type checking (includes shared)
npm run check

# Verify no circular dependencies
npx madge shared --circular
```

## Schema Examples

**Container Schema**
```typescript
// shared/schema.ts
export const containerSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "stopped", "paused", "restarting"]),
  image: z.string(),
  created: z.number(), // Unix timestamp
  ports: z.array(z.object({
    private: z.number(),
    public: z.number().optional(),
    type: z.enum(["tcp", "udp"]),
  })),
  labels: z.record(z.string()).optional(),
  env: z.array(z.string()).optional(),
});

export type Container = z.infer<typeof containerSchema>;
```

**Login Schema**
```typescript
// shared/schema.ts
export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginRequest = z.infer<typeof loginSchema>;
```

**Log Entry Schema**
```typescript
// shared/schema.ts
export const logEntrySchema = z.object({
  timestamp: z.number(), // Unix timestamp
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  message: z.string(),
  containerId: z.string(),
  containerName: z.string(),
  stream: z.enum(["stdout", "stderr"]).optional(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;
```

## Monitoring Utilities

**CPU Metrics** (shared/monitoring.ts)
```typescript
export function cpuMetrics(usage: number, limit: number) {
  return {
    usage,
    limit,
    percentage: limit > 0 ? (usage / limit) * 100 : 0,
  };
}
```

**Memory Metrics** (shared/monitoring.ts)
```typescript
export function memoryMetrics(usage: number, limit: number) {
  return {
    usage,
    limit,
    percentage: limit > 0 ? (usage / limit) * 100 : 0,
    usageMB: usage / (1024 * 1024),
    limitMB: limit / (1024 * 1024),
  };
}
```

## Best Practices

1. **Keep Shared Minimal**: Only types and schemas used by both client and server. No UI components or server logic.
2. **Schema-First Development**: Define Zod schemas first, then infer types. Never the reverse.
3. **Validate at Boundaries**: Server validates incoming data (API routes). Client trusts server responses (no validation).
4. **Type-Only Imports in Client**: Use `import type` to avoid bundling Zod in client production build.
5. **Consistent Naming**: `*Schema` for Zod schemas, `*Type` for types (if not inferred from schema).
6. **Documentation**: Add Zod error messages for user-facing validation errors.
