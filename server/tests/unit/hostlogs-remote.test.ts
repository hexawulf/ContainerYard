import "./_testEnv";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { parseRemoteHostsEnv } from "../../src/config/remoteHosts";
import { createLocalHostLogProvider } from "../../src/services/hostLogs/localProvider";
import { createPideckAgentProvider } from "../../src/services/hostLogs/pideckAgentProvider";
import { HostLogSourceError, type HostLogProvider } from "../../src/services/hostLogs/types";
import { createHostLogsRouter, diffPollLines } from "../../src/routes/hostLogs";
import { getActiveSseStreamCount } from "../../src/lib/sseGuard";
import { startFakePideckAgent, type FakePideckAgent } from "./_fakePideckAgent";
import { startFakeDockerEngine, type FakeEngine } from "./_fakeDockerEngine";

describe("CY_REMOTE_HOSTS logs schema", () => {
  test("parses valid pideck-agent logs config and normalizes origin", () => {
    const hosts = parseRemoteHostsEnv(
      JSON.stringify([
        {
          id: "host-a",
          name: "Host A",
          cadvisorUrl: "http://10.0.0.10:8080",
          logs: {
            type: "pideck-agent",
            url: "http://10.0.0.10:5016/",
            tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A",
          },
        },
      ]),
    );
    assert.equal(hosts[0].logs?.type, "pideck-agent");
    assert.equal(hosts[0].logs?.url, "http://10.0.0.10:5016");
    assert.equal(hosts[0].logs?.tokenEnv, "CY_HOSTLOG_TOKEN_HOST_A");
    assert.equal(hosts[0].logs?.timeoutMs, 5000);
  });

  test("rejects unknown logs.type with a startup warning instead of crashing", () => {
    const warnings: string[] = [];
    const hosts = parseRemoteHostsEnv(
      JSON.stringify([
        {
          id: "host-a",
          name: "Host A",
          cadvisorUrl: "http://10.0.0.10:8080",
          logs: {
            type: "future-agent",
            url: "http://10.0.0.10:5016",
            tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A",
          },
        },
      ]),
      "local",
      (m) => warnings.push(m),
    );
    assert.equal(hosts.length, 1);
    assert.equal(hosts[0].logs, undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /unsupported log provider type/i);
  });

  test("rejects invalid logs.url, logs.tokenEnv, logs.timeoutMs without echoing values", () => {
    const badEntries = [
      {
        id: "host-a",
        name: "Host A",
        cadvisorUrl: "http://10.0.0.10:8080",
        logs: { type: "pideck-agent", url: "http://10.0.0.10:5016/secret-path", tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A" },
      },
      {
        id: "host-a",
        name: "Host A",
        cadvisorUrl: "http://10.0.0.10:8080",
        logs: { type: "pideck-agent", url: "http://10.0.0.10:5016", tokenEnv: "WRONG_SECRET_ENV" },
      },
      {
        id: "host-a",
        name: "Host A",
        cadvisorUrl: "http://10.0.0.10:8080",
        logs: { type: "pideck-agent", url: "http://10.0.0.10:5016", tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 200 },
      },
    ];
    for (const entry of badEntries) {
      assert.throws(
        () => parseRemoteHostsEnv(JSON.stringify([entry])),
        (err: Error) => {
          assert.match(err.message, /CY_REMOTE_HOSTS\[0\]\.logs/);
          assert.doesNotMatch(err.message, /secret-path|WRONG_SECRET_ENV/);
          return true;
        },
      );
    }
  });
});

describe("pideckAgentProvider", () => {
  let agent: FakePideckAgent;

  before(async () => {
    agent = await startFakePideckAgent([
      {
        id: "file_syslog",
        label: "System Log",
        kind: "file",
        readable: true,
        size: 1024,
        mtime: "2026-11-21T00:00:00.000Z",
        file: "/var/log/syslog",
        lines: ["line 1", "line 2 error", "line 3 [REDACTED]"],
        truncated: true,
        redacted: 2,
      },
      {
        id: "journal_docker",
        label: "docker · journal",
        kind: "journal",
        readable: true,
        lines: ["docker started"],
      },
      {
        id: "docker_app",
        label: "app",
        kind: "docker",
        readable: true,
        lines: ["boot ok", "listening"],
      },
    ]);
  });

  after(async () => {
    await agent.close();
  });

  test("maps sources, strips remote file path, and caches list() for TTL", async () => {
    let clock = 1_000_000;
    const provider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 2000 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: agent.token },
      now: () => clock,
      listTtlMs: 15_000,
    });

    const beforeHits = agent.requests.length;
    const r1 = await provider.list();
    assert.equal(r1.error, undefined);
    assert.equal(r1.sources.length, 3);
    assert.equal(r1.sources[0].name, "file_syslog");
    assert.equal(r1.sources[0].title, "System Log");
    assert.equal(r1.sources[0].kind, "file");
    assert.equal(r1.sources[0].available, true);
    assert.equal(r1.sources[0].path, undefined, "remote file path must never be exposed");
    assert.equal(agent.requests.length, beforeHits + 1);

    // Within 15 s TTL → served from cache
    clock += 10_000;
    const r2 = await provider.list();
    assert.equal(r2.sources.length, 3);
    assert.equal(agent.requests.length, beforeHits + 1);

    // Past 15 s TTL → re-fetches
    clock += 10_000;
    await provider.list();
    assert.equal(agent.requests.length, beforeHits + 2);
  });

  test("tail clamps lines to 2000, forwards filter, and returns truncated/redacted metadata", async () => {
    const provider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 2000 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: agent.token },
    });

    const res = await provider.tail("file_syslog", { lines: 9999, grep: "error" });
    assert.deepEqual(res.lines, ["line 2 error"]);
    assert.equal(res.truncated, true);
    assert.equal(res.redacted, 2);

    const last = agent.requests.at(-1)!;
    assert.equal(last.query.get("lines"), "2000");
    assert.equal(last.query.get("filter"), "error");
    assert.deepEqual(Array.from(last.query.keys()).sort(), ["filter", "lines"]);
  });

  test("rejects invalid source ids before making any HTTP call", async () => {
    const provider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 2000 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: agent.token },
    });

    const beforeHits = agent.requests.length;
    for (const bad of ["../x", "a b", "a".repeat(65), "UPPER", "foo?bar=1"]) {
      await assert.rejects(
        () => provider.tail(bad, { lines: 10 }),
        (err: unknown) => err instanceof HostLogSourceError && err.status === 400,
      );
    }
    assert.equal(agent.requests.length, beforeHits, "invalid ids must never hit the agent");
  });

  test("401 maps to agent_auth, never leaks token or agent body, and backs off after 3 failures", async () => {
    let clock = 5_000_000;
    const badToken = "SECRET-WRONG-TOKEN-XYZ-9876";
    const provider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 2000 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: badToken },
      now: () => clock,
      authBackoffMs: 300_000,
    });

    const beforeHits = agent.requests.length;
    for (let i = 0; i < 3; i++) {
      const r = await provider.list();
      assert.equal(r.error?.reason, "agent_auth");
      assert.equal(JSON.stringify(r).includes(badToken), false);
      assert.equal(JSON.stringify(r).includes(agent.bodySecretMarker), false);
    }
    assert.equal(agent.requests.length, beforeHits + 3);

    // 4th attempt within backoff window must NOT hit the agent
    clock += 60_000;
    const backedOff = await provider.list();
    assert.equal(backedOff.error?.reason, "agent_auth");
    assert.equal(agent.requests.length, beforeHits + 3);

    // After backoff expires, next call retries the agent
    clock += 250_000;
    await provider.list();
    assert.equal(agent.requests.length, beforeHits + 4);
  });

  test("maps 404 logs-off, 429 rate-limit, redirect refusal, and timeout cleanly", async () => {
    const provider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 120 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: agent.token },
    });

    try {
      agent.logsEnabled = false;
      const off = await provider.list();
      assert.equal(off.error?.reason, "agent_logs_off");
      assert.equal(JSON.stringify(off).includes(agent.bodySecretMarker), false);
      agent.logsEnabled = true;

      agent.rateLimited = true;
      const rl = await provider.list();
      assert.equal(rl.error?.reason, "agent_rate_limited");
      agent.rateLimited = false;

      agent.redirectTo = "http://127.0.0.1:9/evil";
      const redir = await provider.list();
      assert.equal(redir.error?.reason, "agent_unreachable");
      agent.redirectTo = null;

      agent.delayMs = 300;
      const slow = await provider.list();
      assert.equal(slow.error?.reason, "agent_unreachable");
    } finally {
      agent.logsEnabled = true;
      agent.rateLimited = false;
      agent.redirectTo = null;
      agent.delayMs = 0;
    }
  });
});

describe("diffPollLines", () => {
  test("handles initial batch, incremental new lines, partial overlap, and gap", () => {
    const first = diffPollLines([], ["a", "b", "c", "d"]);
    assert.equal(first.gap, false);
    assert.deepEqual(first.newLines, ["a", "b", "c", "d"]);

    // No new lines
    const same = diffPollLines(first.nextAnchor, ["a", "b", "c", "d"]);
    assert.equal(same.gap, false);
    assert.deepEqual(same.newLines, []);

    // Two new lines
    const inc = diffPollLines(same.nextAnchor, ["a", "b", "c", "d", "e", "f"]);
    assert.equal(inc.gap, false);
    assert.deepEqual(inc.newLines, ["e", "f"]);

    // Partial overlap (oldest anchor lines rolled off the top of batch)
    const partial = diffPollLines(inc.nextAnchor, ["c", "d", "e", "f", "g", "h"]);
    assert.equal(partial.gap, false);
    assert.deepEqual(partial.newLines, ["g", "h"]);

    // Complete gap
    const gapped = diffPollLines(partial.nextAnchor, ["x1", "x2", "x3"]);
    assert.equal(gapped.gap, true);
    assert.deepEqual(gapped.newLines, ["x1", "x2", "x3"]);
  });
});

describe("localProvider (multi-app PM2, legacy compat, cy_app)", () => {
  let tmpDir: string;
  let engine: FakeEngine;
  const SELF_ID = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cy-local-hostlogs-"));
    fs.writeFileSync(path.join(tmpDir, "access.log"), "GET /health 200\nGET /api/hosts 200\n");
    fs.writeFileSync(path.join(tmpDir, "error.log"), "warn: something\n");
    fs.writeFileSync(path.join(tmpDir, "app-one-out-0.log"), "app one started\n");
    fs.writeFileSync(path.join(tmpDir, "app-one-error-0.log"), "app one err\n");
    fs.writeFileSync(path.join(tmpDir, "app-two-out-1.log"), "app two started\n");
    fs.writeFileSync(path.join(tmpDir, "containeryard-api-out-0.log"), "stale pm2 line\n");

    engine = await startFakeDockerEngine([
      {
        id: SELF_ID,
        name: "containeryard-app-1",
        image: "0xwulf/containeryard:test",
        state: "running",
        logs: [
          [1, "API listening on port 5008\n"],
          [2, "stderr notice\n"],
        ],
      },
    ]);
  });

  after(async () => {
    await engine.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("omits stale containeryard-api by default, supports HOSTLOG_PM2_APPS and cy_app", async () => {
    const provider = createLocalHostLogProvider({
      hostId: "local",
      dockerSocketPath: engine.socketPath,
      hostname: () => SELF_ID.slice(0, 12),
      env: {
        HOSTLOGS_LOCAL_HOST: "local",
        HOSTLOG_NGINX_DIR: tmpDir,
        PM2_LOG_DIR: tmpDir,
        HOSTLOG_PM2_APPS: "app-one, app-two",
        HOSTLOG_SELF_CONTAINER: "on",
      },
    });

    const list = await provider.list();
    const names = list.sources.map((s) => s.name);
    assert.ok(names.includes("nginx_access"));
    assert.ok(names.includes("nginx_error"));
    assert.ok(names.includes("pm2_app-one_out"));
    assert.ok(names.includes("pm2_app-one_err"));
    assert.ok(names.includes("pm2_app-two_out"));
    assert.ok(names.includes("pm2_app-two_err"));
    assert.ok(names.includes("cy_app"));
    assert.equal(names.includes("pm2_out"), false, "stale containeryard-api pm2_out must not appear by default");
    assert.equal(names.includes("pm2_err"), false, "stale containeryard-api pm2_err must not appear by default");

    const appTwoErr = list.sources.find((s) => s.name === "pm2_app-two_err");
    assert.equal(appTwoErr?.available, false);

    const cyTail = await provider.tail("cy_app", { lines: 50 });
    assert.ok(cyTail.lines.some((l) => l.includes("API listening on port 5008")));
    assert.ok(cyTail.lines.some((l) => l.includes("stderr notice")));

    const cyGrep = await provider.tail("cy_app", { lines: 50, grep: "stderr" });
    assert.equal(cyGrep.lines.length, 1);
  });

  test("keeps PM2_APP_NAME backwards compatibility when explicitly set and respects HOSTLOG_SELF_CONTAINER=off", async () => {
    const provider = createLocalHostLogProvider({
      hostId: "local",
      dockerSocketPath: engine.socketPath,
      hostname: () => SELF_ID.slice(0, 12),
      env: {
        HOSTLOGS_LOCAL_HOST: "local",
        HOSTLOG_NGINX_DIR: tmpDir,
        PM2_LOG_DIR: tmpDir,
        PM2_APP_NAME: "app-one",
        HOSTLOG_SELF_CONTAINER: "off",
      },
    });

    const list = await provider.list();
    const names = list.sources.map((s) => s.name);
    assert.ok(names.includes("pm2_out"));
    assert.ok(names.includes("pm2_err"));
    assert.equal(names.includes("cy_app"), false);
  });
});

describe("hostLogsRouter remote SSE follow, audit, and RBAC", () => {
  let agent: FakePideckAgent;
  let server: http.Server;
  let base: string;
  const audits: Array<{ action: string; target?: string | null }> = [];

  before(async () => {
    agent = await startFakePideckAgent([
      {
        id: "docker_worker",
        label: "worker",
        kind: "docker",
        readable: true,
        lines: ["init 1", "init 2", "init 3"],
        truncated: true,
        redacted: 1,
      },
    ]);

    const { prisma } = await import("../../src/db/client");
    if (prisma) {
      Object.assign(prisma.auditLog, {
        create: async ({ data }: { data: { action: string; target?: string | null } }) => {
          audits.push(data);
          return data;
        },
      });
      Object.assign(prisma.user, {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "u-ADMIN"
            ? { id: "u-ADMIN", email: "admin@example.invalid", role: "ADMIN", sessionVersion: 0 }
            : where.id === "u-VIEWER"
              ? { id: "u-VIEWER", email: "viewer@example.invalid", role: "VIEWER", sessionVersion: 0 }
              : null,
      });
    }

    const remoteProvider = createPideckAgentProvider({
      hostId: "host-a",
      config: { type: "pideck-agent", url: agent.url, tokenEnv: "CY_HOSTLOG_TOKEN_HOST_A", timeoutMs: 2000 },
      env: { CY_HOSTLOG_TOKEN_HOST_A: agent.token },
    });

    const providers: Record<string, HostLogProvider> = { "host-a": remoteProvider };
    const router = createHostLogsRouter({
      getProvider: (hostId) => providers[hostId] ?? null,
      remotePollMs: 40,
      heartbeatMs: 60_000,
      isSessionValid: async () => true,
    });

    const app = express();
    app.use((req, _res, next) => {
      const role = req.headers["x-test-role"];
      Object.assign(req, {
        session:
          role === "ADMIN" || role === "VIEWER"
            ? { user: { id: `u-${String(role)}`, email: "admin@example.invalid", role } }
            : {},
      });
      next();
    });
    app.use("/api/hosts", router);

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await agent.close();
  });

  test("unconfigured host returns empty list with clear message, VIEWER gets 403", async () => {
    const viewer = await fetch(`${base}/api/hosts/host-a/logs`, { headers: { "x-test-role": "VIEWER" } });
    assert.equal(viewer.status, 403);

    const ds = await fetch(`${base}/api/hosts/nas-1/logs`, { headers: { "x-test-role": "ADMIN" } });
    assert.equal(ds.status, 200);
    const body = (await ds.json()) as { logs: unknown[]; message?: string };
    assert.deepEqual(body.logs, []);
    assert.match(body.message ?? "", /No log source is configured/i);
  });

  test("snapshot returns X-CY-Log-Truncated / X-CY-Log-Redacted headers and writes one audit row", async () => {
    const auditsBefore = audits.length;
    const res = await fetch(`${base}/api/hosts/host-a/logs/docker_worker?tail=50`, {
      headers: { "x-test-role": "ADMIN" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-cy-log-truncated"), "true");
    assert.equal(res.headers.get("x-cy-log-redacted"), "1");
    const text = await res.text();
    assert.equal(text, "init 1\ninit 2\ninit 3");
    assert.equal(audits.length, auditsBefore + 1);
    assert.equal(audits.at(-1)?.action, "hostlogs.read");
    assert.equal(audits.at(-1)?.target, "host-a/docker_worker");
  });

  test("remote SSE follow streams new lines + gap without auditing polls, and stops timers on close", async () => {
    const auditsBefore = audits.length;
    const controller = new AbortController();
    const res = await fetch(`${base}/api/hosts/host-a/logs/docker_worker?follow=1`, {
      headers: { "x-test-role": "ADMIN" },
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let collected = "";

    async function readUntil(predicate: (s: string) => boolean, timeoutMs = 2000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (!predicate(collected)) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for SSE data. Got:\n${collected}`);
        const { done, value } = await reader.read();
        if (done) break;
        collected += decoder.decode(value, { stream: true });
      }
    }

    await readUntil((s) => s.includes("data: init 3"));

    // Push incremental line
    agent.sources[0].lines = ["init 1", "init 2", "init 3", "live 4"];
    await readUntil((s) => s.includes("data: live 4"));

    // Simulate complete rotation / gap
    agent.sources[0].lines = ["after-gap 1", "after-gap 2"];
    await readUntil((s) => s.includes("event: gap") && s.includes("data: after-gap 2"));

    // Close stream and verify timers stop (no further agent requests after brief settle)
    controller.abort();
    await reader.cancel().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(getActiveSseStreamCount("u-ADMIN"), 0, "SSE stream slot must be released on close");
    const hitsAfterClose = agent.requests.length;
    await new Promise((r) => setTimeout(r, 180));
    assert.equal(agent.requests.length, hitsAfterClose, "polling timer must stop when SSE stream closes");
    assert.equal(audits.length, auditsBefore, "follow polls must not write audit rows");
  });
});
