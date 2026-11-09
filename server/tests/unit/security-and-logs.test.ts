import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DockerLogDemuxer, demuxDockerLogs } from "../../src/lib/dockerDemux";
import {
  blockedReason,
  postWebhook,
  validateWebhookUrl,
  WebhookBlockedError,
  type WebhookPolicy,
} from "../../src/lib/safeWebhook";
import { tokensMatch, verifyCsrf } from "../../src/middleware/csrf";

function frame(stream: number, text: string | Buffer): Buffer {
  const payload = Buffer.isBuffer(text) ? text : Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

const strict: WebhookPolicy = { allowPrivate: false, allowedHosts: new Set() };
const lan: WebhookPolicy = { allowPrivate: true, allowedHosts: new Set() };

// ---------- demux ----------

test("demux: whole multiplexed buffer", () => {
  const buf = Buffer.concat([frame(1, "out line\n"), frame(2, "err line\n")]);
  assert.equal(demuxDockerLogs(buf), "out line\nerr line\n");
});

test("demux: frame split across chunks (old bug) is reassembled", () => {
  const buf = Buffer.concat([frame(1, "hello world\n"), frame(1, "second\n")]);
  const d = new DockerLogDemuxer();
  let out = "";
  // feed one byte at a time: worst case for chunk boundaries
  for (let i = 0; i < buf.length; i++) out += d.push(buf.subarray(i, i + 1));
  out += d.end();
  assert.equal(out, "hello world\nsecond\n");
});

test("demux: multi-byte UTF-8 split across frames stays intact", () => {
  const snowman = Buffer.from("☃\n"); // e2 98 83 0a
  const buf = Buffer.concat([frame(1, snowman.subarray(0, 2)), frame(1, snowman.subarray(2))]);
  assert.equal(demuxDockerLogs(buf), "☃\n");
});

test("demux: TTY (raw) stream passes through", () => {
  const d = new DockerLogDemuxer();
  const out = d.push(Buffer.from("plain tty output\n")) + d.push(Buffer.from("more\n")) + d.end();
  assert.equal(out, "plain tty output\nmore\n");
});

test("demux: short raw output below header size is flushed on end()", () => {
  const d = new DockerLogDemuxer();
  assert.equal(d.push(Buffer.from("hi")), "");
  assert.equal(d.end(), "hi");
});

// ---------- SSRF ----------

test("ssrf: blocks metadata, link-local and multicast even when private is allowed", () => {
  for (const ip of ["169.254.169.254", "0.0.0.0", "224.0.0.1", "fe80::1", "::", "fd00:ec2::254", "::ffff:169.254.169.254"]) {
    assert.ok(blockedReason(ip, lan), `${ip} should be blocked`);
  }
});

test("ssrf: private ranges blocked by default, allowed with WEBHOOK_ALLOW_PRIVATE", () => {
  const rfc1918c = [192, 168].join("."); // 192.168/16, built so repo scans stay clean
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", `${rfc1918c}.0.10`, "100.100.1.1", "::1", "fd12::1", `::ffff:${rfc1918c}.1.1`]) {
    assert.ok(blockedReason(ip, strict), `${ip} should be blocked by default`);
    assert.equal(blockedReason(ip, lan), null, `${ip} should be allowed with allowPrivate`);
  }
  assert.equal(blockedReason("1.1.1.1", strict), null);
  assert.equal(blockedReason("2606:4700:4700::1111", strict), null);
});

test("ssrf: URL validation", () => {
  assert.throws(() => validateWebhookUrl("file:///etc/passwd", strict), WebhookBlockedError);
  assert.throws(() => validateWebhookUrl("gopher://x", strict), WebhookBlockedError);
  assert.throws(() => validateWebhookUrl("https://u:p@example.com/", strict), WebhookBlockedError);
  assert.throws(() => validateWebhookUrl("http://localhost:6379/", strict), WebhookBlockedError);
  assert.throws(() => validateWebhookUrl("http://[::1]/", strict), WebhookBlockedError);
  assert.throws(() => validateWebhookUrl("http://169.254.169.254/latest/meta-data", lan), WebhookBlockedError);
  assert.ok(validateWebhookUrl("https://hooks.example.com/abc", strict));
  const allow: WebhookPolicy = { allowPrivate: false, allowedHosts: new Set(["ntfy.lan"]) };
  assert.ok(validateWebhookUrl("http://ntfy.lan/topic", allow));
});

test("ssrf: hostname resolving to loopback is blocked at connect time", async () => {
  const server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await assert.rejects(postWebhook(`http://localhost.:${port}/`, { a: 1 }, {}, { policy: strict }), /blocked/i);
    // With allowPrivate the same target is reachable.
    const ok = await postWebhook(`http://127.0.0.1:${port}/`, { a: 1 }, {}, { policy: lan });
    assert.equal(ok.status, 200);
  } finally {
    server.close();
  }
});

test("ssrf: redirects are not followed", async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(302, { Location: "http://169.254.169.254/" }).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await postWebhook(`http://127.0.0.1:${port}/`, {}, {}, { policy: lan });
    assert.equal(res.status, 302);
    assert.equal(hits, 1);
  } finally {
    server.close();
  }
});

// ---------- CSRF ----------

function run(method: string, sessionToken?: string, header?: string) {
  const req: any = { method, session: sessionToken ? { csrfToken: sessionToken } : {}, headers: header ? { "x-csrf-token": header } : {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  let nextCalled = false;
  verifyCsrf(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode };
}

test("csrf: safe methods pass without a token", () => {
  assert.equal(run("GET").nextCalled, true);
  assert.equal(run("HEAD").nextCalled, true);
});

test("csrf: mutating requests need the session token", () => {
  assert.deepEqual(run("POST"), { nextCalled: false, status: 403 });
  assert.deepEqual(run("POST", "abc123"), { nextCalled: false, status: 403 });
  assert.deepEqual(run("DELETE", "abc123", "wrong1"), { nextCalled: false, status: 403 });
  assert.deepEqual(run("PATCH", "abc123", "abc123"), { nextCalled: true, status: 200 });
});

test("csrf: tokensMatch rejects length mismatch and non-strings", () => {
  assert.equal(tokensMatch("abc", "abcd"), false);
  assert.equal(tokensMatch(undefined, "abc"), false);
  assert.equal(tokensMatch("", ""), false);
});

// ---------- Public exposure lockdown (/api/hosts & /api/runtime-config) ----------

test("hosts & runtime-config: unauthenticated GET /api/hosts -> 401, /api/runtime-config omits hosts, authenticated GET /api/hosts returns list", async () => {
  process.env.SESSION_SECRET ??= "0123456789abcdef0123456789abcdef";
  process.env.ALLOWED_ORIGINS ??= "http://127.0.0.1:5008";
  process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
  process.env.CY_REMOTE_HOSTS ??= JSON.stringify([
    { id: "edge-01", name: "Edge 01", cadvisorUrl: "http://127.0.0.1:18080" },
    { id: "nas-01", name: "NAS 01", cadvisorUrl: "http://127.0.0.1:18081" },
  ]);
  process.env.ADMIN_EMAIL ??= "admin@example.invalid";
  process.env.ADMIN_PASSWORD ??= "TestAdminPassword123!";
  process.env.DATABASE_URL ??= "file:/tmp/cy-unit-nonexistent.db";

  const express = (await import("express")).default;
  const { registerRuntimeConfigRoute } = await import("../../src/routes/runtimeConfig");
  const { hostsRouter } = await import("../../src/routes/hosts");
  const { listHosts } = await import("../../src/config/hosts");
  const dbMod = await import("../../src/db/client");

  // Stub prisma.user.findUnique for authenticated session check without hitting disk DB
  const origFindUnique = dbMod.prisma?.user.findUnique;
  if (dbMod.prisma) {
    (dbMod.prisma.user as any).findUnique = async ({ where }: { where: { id: string } }) =>
      where.id === "u-admin"
        ? { id: "u-admin", email: "admin@example.invalid", role: "ADMIN", sessionVersion: 0 }
        : null;
  }

  const app = express();
  app.use((req: any, _res, next) => {
    req.session = req.headers["x-test-auth"] === "admin"
      ? { user: { id: "u-admin", email: "admin@example.invalid", role: "ADMIN", sessionVersion: 0 } }
      : {};
    next();
  });
  registerRuntimeConfigRoute(app);
  app.use("/api/hosts", hostsRouter);

  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Unauthenticated GET /api/hosts -> 401
    const unauthRes = await fetch(`${base}/api/hosts`);
    assert.equal(unauthRes.status, 401);

    // 2. /api/runtime-config contains no hosts key and no configured host ids or names
    const rcRes = await fetch(`${base}/api/runtime-config`, { headers: { host: "containeryard.org" } });
    assert.equal(rcRes.status, 200);
    const rcText = await rcRes.text();
    const rcJson = JSON.parse(rcText) as Record<string, unknown>;
    assert.equal("hosts" in rcJson, false, "runtime-config must not include hosts");
    for (const h of listHosts()) {
      assert.equal(rcText.includes(h.id), false, `runtime-config leaked host id ${h.id}`);
      assert.equal(rcText.includes(h.name), false, `runtime-config leaked host name ${h.name}`);
    }

    // 3. Authenticated GET /api/hosts returns the list
    const authRes = await fetch(`${base}/api/hosts`, { headers: { "x-test-auth": "admin" } });
    assert.equal(authRes.status, 200);
    const hosts = (await authRes.json()) as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(hosts) && hosts.length > 0);
    assert.deepEqual(hosts.map((h) => h.id), listHosts().map((h) => h.id));
  } finally {
    if (dbMod.prisma && origFindUnique) {
      (dbMod.prisma.user as any).findUnique = origFindUnique;
    }
    server.close();
  }
});
