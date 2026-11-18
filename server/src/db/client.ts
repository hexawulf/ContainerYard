/**
 * Prisma client — CANONICAL for auth/user data (SQLite).
 *
 * Schema: server/prisma/schema.prisma (User model, Role enum)
 * Used by: server/src/routes/auth.ts, server/src/index.ts
 *
 * The monitoring/alerting data layer uses Drizzle + PostgreSQL instead (server/db.ts).
 * See server/src/config/databaseCapabilities.ts for runtime detection.
 */
import { PrismaClient } from '@prisma/client';

export const prisma: PrismaClient | null = process.env.DATABASE_URL ? new PrismaClient() : null;
