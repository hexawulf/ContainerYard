import "./_testEnv";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import rateLimit from "express-rate-limit";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyCsrf } from "../../src/middleware/csrf";
import { createAuthRouter } from "../../src/routes/auth";
import { invalidateUserSessionCache, requireAuth } from "../../src/middleware/auth";
import { isSseSessionValid } from "../../src/lib/sseGuard";

interface AuditRow {
  action: string;
  outcome: string;
  target: string | null;
  detail: string | null;
}

interface SessionState {
  csrfToken?: string;
  user?: {
    id: string;
    email: string;
    role: "ADMIN" | "VIEWER";
    sessionVersion: number;
    authMethod?: "password" | "google";
  };
  cookie: { maxAge?: number };
  regenerate(cb: (err?: unknown) => void): void;
  destroy(cb: (err?: unknown) => void): void;
  save(cb: (err?: unknown) => void): void;
}

const FB_ENV: NodeJS.ProcessEnv = {
  FIREBASE_ENABLED: "true",
  FIREBASE_PROJECT_ID: "containeryard-prod",
  FIREBASE_CLIENT_API_KEY: "test-public-api-key",
  FIREBASE_CLIENT_AUTH_DOMAIN: "containeryard-prod.firebaseapp.com",
  FIREBASE_CLIENT_APP_ID: "1:999:web:abc",
  FIREBASE_ALLOWED_EMAILS: "admin@example.com,viewer@example.com,missing-db@example.com",
};

describe("POST /api/auth/firebase-login and session re-check", () => {
  let server: http.Server;
  let base: string;
  const audits: AuditRow[] = [];
  const sessions = new Map<string, SessionState>();
  let nextSid = 1;
  let activeEnv: NodeJS.ProcessEnv = { ...FB_ENV };
  let origFindUnique: unknown;
  let origAuditCreate: unknown;

  function makeSession(): { sid: string; state: SessionState } {
    const sid = `sid-${nextSid++}`;
    const state: SessionState = {
      cookie: {},
      regenerate(cb) {
        this.user = undefined;
        this.csrfToken = undefined;
        cb();
      },
      destroy(cb) {
        sessions.delete(sid);
        this.user = undefined;
        this.csrfToken = undefined;
        cb();
      },
      save(cb) {
        cb();
      },
    };
    sessions.set(sid, state);
    return { sid, state };
  }

  before(async () => {
    const { prisma } = await import("../../src/db/client");
    assert.ok(prisma);
    origFindUnique = prisma.user.findUnique;
    origAuditCreate = prisma.auditLog.create;

    const users = [
      { id: "u-admin", email: "admin@example.com", role: "ADMIN" as const, sessionVersion: 1, password: "x" },
      { id: "u-viewer", email: "viewer@example.com", role: "VIEWER" as const, sessionVersion: 2, password: "x" },
    ];

    Object.assign(prisma.user, {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
    });
    Object.assign(prisma.auditLog, {
      create: async ({ data }: { data: AuditRow }) => {
        audits.push(data);
        return data;
      },
    });

    const testLimiter = rateLimit({
      windowMs: 60_000,
      max: 8,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { message: "Too many login attempts. Please try again later." },
    });

    const router = createAuthRouter({
      getEnv: () => activeEnv,
      rateLimiter: testLimiter,
      verifyIdToken: async (token) => {
        if (token === "tok-admin") {
          return {
            uid: "g-admin",
            email: "admin@example.com",
            email_verified: true,
            firebase: { identities: {}, sign_in_provider: "google.com" },
          } as DecodedIdToken;
        }
        if (token === "tok-viewer") {
          return {
            uid: "g-viewer",
            email: "viewer@example.com",
            email_verified: true,
            firebase: { identities: {}, sign_in_provider: "google.com" },
          } as DecodedIdToken;
        }
        if (token === "tok-no-db") {
          return {
            uid: "g-nodb",
            email: "missing-db@example.com",
            email_verified: true,
            firebase: { identities: {}, sign_in_provider: "google.com" },
          } as DecodedIdToken;
        }
        throw new Error("bad token");
      },
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const incoming = typeof req.headers["x-test-sid"] === "string" ? req.headers["x-test-sid"] : undefined;
      let sid = incoming;
      let state = sid ? sessions.get(sid) : undefined;
      if (!state) {
        const created = makeSession();
        sid = created.sid;
        state = created.state;
      }
      res.setHeader("x-test-sid", sid!);
      Object.assign(req, { session: state });
      next();
    });
    app.use("/api", verifyCsrf);
    app.use("/api/auth", router);
    app.get("/api/protected", requireAuth, (req, res) => {
      res.json({ user: req.session.user });
    });

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const { prisma } = await import("../../src/db/client");
    if (prisma && origFindUnique && origAuditCreate) {
      Object.assign(prisma.user, { findUnique: origFindUnique });
      Object.assign(prisma.auditLog, { create: origAuditCreate });
    }
    delete process.env.FIREBASE_ENABLED;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_API_KEY;
    delete process.env.FIREBASE_CLIENT_AUTH_DOMAIN;
    delete process.env.FIREBASE_CLIENT_APP_ID;
    delete process.env.FIREBASE_ALLOWED_EMAILS;
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function getCsrf(): Promise<{ sid: string; csrf: string }> {
    const res = await fetch(`${base}/api/auth/csrf`);
    const sid = res.headers.get("x-test-sid")!;
    const body = (await res.json()) as { csrfToken: string };
    return { sid, csrf: body.csrfToken };
  }

  test("GET /api/auth/config returns public config without emails", async () => {
    const res = await fetch(`${base}/api/auth/config`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { firebase: Record<string, unknown> };
    assert.equal(body.firebase.enabled, true);
    assert.equal(body.firebase.authDomain, "containeryard-prod.firebaseapp.com");
    assert.equal(JSON.stringify(body).includes("admin@example.com"), false);
  });

  test("GET /api/auth/firebase-login -> 405 with Allow: POST", async () => {
    const res = await fetch(`${base}/api/auth/firebase-login`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  });

  test("POST /api/auth/firebase-login without CSRF -> 403", async () => {
    const res = await fetch(`${base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "tok-admin" }),
    });
    assert.equal(res.status, 403);
  });

  test("valid token with no DB user row -> 403 and audited failure", async () => {
    const { sid, csrf } = await getCsrf();
    const res = await fetch(`${base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-sid": sid, "x-csrf-token": csrf },
      body: JSON.stringify({ idToken: "tok-no-db" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /no ContainerYard user/i);
    assert.equal(audits.at(-1)?.outcome, "failure");
    assert.equal(audits.at(-1)?.detail, "google: no_user_row");
  });

  test("valid token sets session, role from DB, rotates CSRF, and writes success audit", async () => {
    Object.assign(process.env, FB_ENV);
    invalidateUserSessionCache();

    const { sid, csrf } = await getCsrf();
    const res = await fetch(`${base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-sid": sid, "x-csrf-token": csrf },
      body: JSON.stringify({ idToken: "tok-viewer" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { user: { id: string; email: string; role: string; authMethod: string } };
    assert.deepEqual(body.user, {
      id: "u-viewer",
      email: "viewer@example.com",
      role: "VIEWER",
      authMethod: "google",
    });
    assert.equal(audits.at(-1)?.outcome, "success");
    assert.equal(audits.at(-1)?.detail, "google");

    // CSRF token must have rotated
    const session = sessions.get(sid)!;
    assert.ok(session.csrfToken && session.csrfToken !== csrf);

    // /api/auth/me returns authMethod: "google"
    const meRes = await fetch(`${base}/api/auth/me`, { headers: { "x-test-sid": sid } });
    assert.equal(meRes.status, 200);
    const me = (await meRes.json()) as { user: { authMethod: string; role: string } };
    assert.equal(me.user.authMethod, "google");
    assert.equal(me.user.role, "VIEWER");
  });

  test("requireAuth and isSseSessionValid revoke Google session when removed from allowlist or disabled", async () => {
    Object.assign(process.env, FB_ENV);
    invalidateUserSessionCache();

    const { sid, csrf } = await getCsrf();
    const loginRes = await fetch(`${base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-sid": sid, "x-csrf-token": csrf },
      body: JSON.stringify({ idToken: "tok-admin" }),
    });
    assert.equal(loginRes.status, 200);

    // Allowed right now
    const okRes = await fetch(`${base}/api/protected`, { headers: { "x-test-sid": sid } });
    assert.equal(okRes.status, 200);
    const sseReq = { session: { user: sessions.get(sid)?.user } } as unknown as express.Request;
    assert.equal(await isSseSessionValid(sseReq, { requireRole: "ADMIN" }), true);

    // Remove admin@example.com from allowlist -> SSE heartbeat fails, requireAuth destroys session -> 401
    process.env.FIREBASE_ALLOWED_EMAILS = "viewer@example.com";
    assert.equal(await isSseSessionValid(sseReq, { requireRole: "ADMIN" }), false);

    const revokedRes = await fetch(`${base}/api/protected`, { headers: { "x-test-sid": sid } });
    assert.equal(revokedRes.status, 401);
    assert.equal(sessions.has(sid), false, "revoked Google session must be destroyed");

    // Restore allowlist, log in again, then disable Firebase -> 401 + SSE false
    process.env.FIREBASE_ALLOWED_EMAILS = FB_ENV.FIREBASE_ALLOWED_EMAILS;
    const { sid: sid2, csrf: csrf2 } = await getCsrf();
    const login2 = await fetch(`${base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-sid": sid2, "x-csrf-token": csrf2 },
      body: JSON.stringify({ idToken: "tok-admin" }),
    });
    assert.equal(login2.status, 200);

    process.env.FIREBASE_ENABLED = "false";
    const sseReq2 = { session: { user: sessions.get(sid2)?.user } } as unknown as express.Request;
    assert.equal(await isSseSessionValid(sseReq2, { requireRole: "ADMIN" }), false);
    const disabledRes = await fetch(`${base}/api/protected`, { headers: { "x-test-sid": sid2 } });
    assert.equal(disabledRes.status, 401);

    Object.assign(process.env, FB_ENV);
  });

  test("rate limiter returns 429 after repeated login attempts", async () => {
    let saw429 = false;
    for (let i = 0; i < 10 && !saw429; i++) {
      const { sid, csrf } = await getCsrf();
      const res = await fetch(`${base}/api/auth/firebase-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-sid": sid, "x-csrf-token": csrf },
        body: JSON.stringify({ idToken: "junk-token" }),
      });
      if (res.status === 429) saw429 = true;
    }
    assert.equal(saw429, true, "login rate limiter must return 429");
  });
});
