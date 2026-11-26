/**
 * Prisma client — CANONICAL data layer for ContainerYard (SQLite).
 *
 * Schema: server/prisma/schema.prisma
 * Models: User, AuditLog, LogBookmark, SavedSearch, NotificationChannel,
 *         AlertRule, AlertHistory, ContainerMetricsHourly, ContainerRestart
 */
import { PrismaClient } from '@prisma/client';

export const prisma: PrismaClient | null = process.env.DATABASE_URL ? new PrismaClient() : null;
