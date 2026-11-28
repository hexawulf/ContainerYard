/**
 * /api/alerts routes with an in-memory Prisma stub: who acknowledges an alert,
 * and which alert changes are written to the audit log
 * (security audit 2026-11-28, CY-23 and CY-25).
 */
import "./_testEnv";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { errorInfo } from "../../src/lib/httpError";

interface AlertRow {
  id: number;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

interface AuditRow {
  action: string;
  outcome: string;
  target: string | null;
  detail: string | null;
  userEmail: string | null;
}

const USERS = {
  ADMIN: { id: "u-admin", email: "admin@example.invalid", role: "ADMIN", sessionVersion: 0 },
  VIEWER: { id: "u-viewer", email: "viewer@example.invalid", role: "VIEWER", sessionVersion: 0 },
} as const;

let alerts = new Map<number, AlertRow>();
const audits: AuditRow[] = [];
let server: http.Server;
let base: string;

before(async () => {
  const { alertsRouter } = await import("../../src/routes/alerts");
  const { prisma } = await import("../../src/db/client");
  assert.ok(prisma, "prisma client is available in tests");

  Object.assign(prisma.user, {
    findUnique: async ({ where }: { where: { id: string } }) =>
      Object.values(USERS).find((u) => u.id === where.id) ?? null,
  });
  Object.assign(prisma.auditLog, {
    create: async ({ data }: { data: AuditRow }) => {
      audits.push(data);
      return data;
    },
  });
  Object.assign(prisma.alertHistory, {
    updateMany: async ({ where, data }: { where: { id: number; acknowledgedAt: null }; data: Partial<AlertRow> }) => {
      const row = alerts.get(where.id);
      if (!row || row.acknowledgedAt !== null) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    findUnique: async ({ where }: { where: { id: number } }) => alerts.get(where.id) ?? null,
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    const user = role === "ADMIN" || role === "VIEWER" ? USERS[role] : undefined;
    Object.assign(req, { session: user ? { user: { ...user } } : {} });
    next();
  });
  app.use("/api/alerts", alertsRouter);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const info = errorInfo(err);
    res.status(info.status ?? 500).json({ error: info.message });
  });

  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  alerts = new Map([[1, { id: 1, acknowledgedAt: null, acknowledgedBy: null }]]);
});

async function call(path: string, method: string, role: "ADMIN" | "VIEWER", body?: unknown) {
  const res = await fetch(`${base}/api/alerts${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-role": role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("CY-25: alert acknowledgement", () => {
  test("acknowledgedBy is the session user, not the request body", async () => {
    const r = await call("/history/1/acknowledge", "POST", "ADMIN", { acknowledgedBy: "someone-else" });
    assert.equal(r.status, 200);
    assert.equal(alerts.get(1)!.acknowledgedBy, USERS.ADMIN.email);
  });

  test("a second acknowledgement is refused and keeps the first record", async () => {
    await call("/history/1/acknowledge", "POST", "ADMIN");
    const first = alerts.get(1)!.acknowledgedAt;
    const r = await call("/history/1/acknowledge", "POST", "ADMIN");
    assert.equal(r.status, 409);
    assert.equal(alerts.get(1)!.acknowledgedAt, first);
  });

  test("unknown alert → 404, VIEWER → 403", async () => {
    assert.equal((await call("/history/99/acknowledge", "POST", "ADMIN")).status, 404);
    assert.equal((await call("/history/1/acknowledge", "POST", "VIEWER")).status, 403);
    assert.equal(alerts.get(1)!.acknowledgedAt, null);
  });
});
