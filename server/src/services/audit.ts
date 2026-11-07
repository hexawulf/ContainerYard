/**
 * Audit log for state-changing operations (container/stack actions, logins).
 * Stored with Prisma, so it works in SQLite mode (production) as well as
 * PostgreSQL. Writing an audit entry never fails the request that triggered it.
 */
import type { Request } from "express";
import { prisma } from "../db/client";
import { log } from "../../vite";

export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditEntry {
  action: string; // e.g. "container.stop", "stack.restart", "auth.login"
  outcome: AuditOutcome;
  hostId?: string;
  target?: string;
  detail?: string;
}

const MAX_DETAIL = 1000;

export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  if (!prisma) return;
  const user = req.session?.user;
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        outcome: entry.outcome,
        hostId: entry.hostId ?? null,
        target: entry.target ?? null,
        detail: entry.detail ? entry.detail.slice(0, MAX_DETAIL) : null,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        ip: req.ip ?? null,
      },
    });
  } catch (error) {
    log(`Failed to write audit log (${entry.action}): ${(error as Error).message}`, "error");
  }
}

export async function listAudit(opts: { limit?: number; before?: number; action?: string } = {}) {
  if (!prisma) return [];
  const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return prisma.auditLog.findMany({
    where: {
      ...(opts.before ? { id: { lt: opts.before } } : {}),
      ...(opts.action ? { action: { startsWith: opts.action } } : {}),
    },
    orderBy: { id: "desc" },
    take,
  });
}

export async function pruneAudit(retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 180)): Promise<number> {
  if (!prisma || !Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
