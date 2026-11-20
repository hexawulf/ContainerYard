/**
 * POST /api/hosts/:hostId/containers/:containerId/actions, end to end:
 * Express router → auth/role check → docker.ts → real dockerode → fake
 * Docker Engine on a Unix socket. Audit writes are captured from Prisma.
 */
import "./_testEnv";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { errorInfo } from "../../src/lib/httpError";
import { startFakeDockerEngine, type FakeEngine } from "./_fakeDockerEngine";

const WEB = "d1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";
const JOB = "e1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";

interface AuditRow {
  action: string;
  outcome: string;
  hostId: string | null;
  target: string | null;
  detail: string | null;
  userEmail: string | null;
}

let engine: FakeEngine;
let server: http.Server;
let base: string;
const audits: AuditRow[] = [];

before(async () => {
  engine = await startFakeDockerEngine([
    { id: WEB, name: "web", image: "nginx", state: "running" },
    { id: JOB, name: "job", image: "busybox", state: "exited" },
  ]);
  // The env module reads these at import time, so set them before importing the router.
  process.env.DOCKER_HOST = `unix://${engine.socketPath}`;
  process.env.CY_LOCAL_HOST_ID = "local";
  process.env.CY_REMOTE_HOSTS = JSON.stringify([
    { id: "nas", name: "NAS", cadvisorUrl: "http://192.0.2.10:8080" },
  ]);

  const { actionsRouter } = await import("../../src/routes/actions");
  const { prisma } = await import("../../src/db/client");
  assert.ok(prisma, "prisma client is available in tests");
  Object.assign(prisma.auditLog, {
    create: async ({ data }: { data: AuditRow }) => {
      audits.push(data);
      return data;
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    Object.assign(req, {
      session:
        role === "ADMIN" || role === "VIEWER"
          ? { user: { id: `u-${role}`, email: `${String(role).toLowerCase()}@example.invalid`, role } }
          : {},
    });
    next();
  });
  app.use("/api/hosts", actionsRouter);
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
  await engine.close();
});

async function act(container: string, action: unknown, role?: "ADMIN" | "VIEWER", hostId = "local") {
  const res = await fetch(`${base}/api/hosts/${hostId}/containers/${container}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}) },
    body: JSON.stringify({ action }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function lastAudit(): AuditRow | undefined {
  return audits.at(-1);
}

describe("who may act", () => {
  test("no session → 401 and nothing is audited", async () => {
    const before = audits.length;
    const r = await act("web", "stop");
    assert.equal(r.status, 401);
    assert.equal(audits.length, before);
    assert.equal(engine.containers.get(WEB)!.state, "running");
  });

  test("VIEWER → 403, the attempt is audited as denied, the container is untouched", async () => {
    const r = await act("web", "stop", "VIEWER");
    assert.equal(r.status, 403);
    assert.deepEqual(
      { action: lastAudit()?.action, outcome: lastAudit()?.outcome, target: lastAudit()?.target, user: lastAudit()?.userEmail },
      { action: "container.stop", outcome: "denied", target: "web", user: "viewer@example.invalid" },
    );
    assert.equal(engine.containers.get(WEB)!.state, "running");
  });
});

describe("input checks (ADMIN)", () => {
  test("an unknown action is a 400 that lists the allowed ones", async () => {
    const r = await act("web", "explode", "ADMIN");
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.allowed, ["start", "stop", "restart", "pause", "unpause", "remove"]);
  });

  test("a malformed container id is a 400 before Docker is called", async () => {
    const before = engine.requests.length;
    const r = await act("-bad", "stop", "ADMIN");
    assert.equal(r.status, 400);
    assert.equal(engine.requests.length, before);
  });

  test("an unknown host is a 404", async () => {
    const r = await act("web", "stop", "ADMIN", "nowhere");
    assert.equal(r.status, 404);
  });

  test("a cAdvisor-only host is read-only (501)", async () => {
    const r = await act("web", "stop", "ADMIN", "nas");
    assert.equal(r.status, 501);
    assert.match(String(r.body.error), /read-only/);
  });
});

describe("actions (ADMIN)", () => {
  test("stop → 200 with the new state, audited as success", async () => {
    const r = await act("web", "stop", "ADMIN");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, action: "stop", id: WEB, name: "web", state: "exited", noop: false });
    assert.equal(engine.containers.get(WEB)!.state, "exited");
    assert.deepEqual(
      { outcome: lastAudit()?.outcome, detail: lastAudit()?.detail, host: lastAudit()?.hostId, user: lastAudit()?.userEmail },
      { outcome: "success", detail: "state: exited", host: "local", user: "admin@example.invalid" },
    );
  });

  test("a no-op is still a success, and the audit says so", async () => {
    const r = await act("web", "stop", "ADMIN");
    assert.equal(r.status, 200);
    assert.equal(r.body.noop, true);
    assert.equal(lastAudit()?.detail, "no-op: container already exited");
  });

  test("a Docker conflict is a 409 and is audited as a failure with the reason", async () => {
    const r = await act("job", "pause", "ADMIN");
    assert.equal(r.status, 409);
    assert.match(String(r.body.error), /^Cannot pause job: Container .* is not running$/);
    assert.equal(lastAudit()?.outcome, "failure");
    assert.equal(lastAudit()?.detail, r.body.error);
  });

  test("a missing container is a 404, audited as a failure", async () => {
    const r = await act("ghost", "restart", "ADMIN");
    assert.equal(r.status, 404);
    assert.equal(lastAudit()?.outcome, "failure");
    assert.equal(lastAudit()?.target, "ghost");
  });

  test("remove → audited as removed", async () => {
    const r = await act("job", "remove", "ADMIN");
    assert.equal(r.status, 200);
    assert.equal(lastAudit()?.detail, "state: removed");
    assert.equal(engine.containers.has(JOB), false);
  });
});

describe("rate limit", () => {
  test("more than 30 actions a minute are refused with 429", async () => {
    let limited: { status: number; body: Record<string, unknown> } | undefined;
    for (let i = 0; i < 31 && !limited; i++) {
      const r = await act("web", "start", "ADMIN");
      if (r.status === 429) limited = r;
    }
    assert.ok(limited, "the limiter answered 429 within 31 requests");
    assert.equal(limited.body.error, "Too many container actions. Please wait a minute.");
  });
});
