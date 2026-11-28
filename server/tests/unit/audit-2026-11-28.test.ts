/**
 * Regression tests for the 2026-11-28 security audit
 * (docs/security/SECURITY_AUDIT_2026-11-28.md). One describe block per finding.
 */
import "./_testEnv";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { clampLogTail, MAX_LOG_TAIL } from "../../src/services/docker";
import { isDockerContainerPath, urlForLog } from "../../src/services/cadvisor";
import { escapeCsvField, MAX_METRICS_DAYS, safeParseInt } from "../../src/routes/metrics";
import { channelConfigForRole, containerDetailForRole, HIDDEN_VALUE } from "../../src/lib/redact";
import type { ContainerDetail } from "../../src/models/containers";
import { isPlaceholderSecret, redisUrlHasPlaceholderPassword } from "../../src/lib/placeholderSecrets";

describe("CY-01: container log tail is clamped to 1..MAX_LOG_TAIL", () => {
  test("negative and zero tails become 1 (Docker reads a negative tail as 'all lines')", () => {
    assert.equal(clampLogTail("-1"), 1);
    assert.equal(clampLogTail(-5), 1);
    assert.equal(clampLogTail("0"), 1);
  });
  test("large tails are capped and junk falls back to the default", () => {
    assert.equal(clampLogTail("999999"), MAX_LOG_TAIL);
    assert.equal(clampLogTail("abc"), 500);
    assert.equal(clampLogTail(undefined), 500);
    assert.equal(clampLogTail("200"), 200);
  });
});

describe("CY-02: notification channel config is redacted for non-admins", () => {
  const config = JSON.stringify({
    url: "https://hooks.example.com/services/T000/B000/secret-token",
    headers: { Authorization: "Bearer abcd1234" },
    payload: { channel: "#ops" },
  });

  test("ADMIN gets the stored config unchanged", () => {
    assert.equal(channelConfigForRole(config, "ADMIN"), config);
  });

  test("VIEWER gets the url origin only and every other value hidden", () => {
    const out = channelConfigForRole(config, "VIEWER");
    assert.ok(!out.includes("secret-token"));
    assert.ok(!out.includes("abcd1234"));
    const parsed = JSON.parse(out);
    assert.equal(parsed.url, `https://hooks.example.com/${HIDDEN_VALUE}`);
    assert.deepEqual(parsed.headers, { Authorization: HIDDEN_VALUE });
    assert.deepEqual(parsed.payload, { channel: HIDDEN_VALUE });
  });

  test("unparseable or non-object configs are fully hidden", () => {
    assert.equal(channelConfigForRole("not json", undefined), JSON.stringify(HIDDEN_VALUE));
    assert.equal(channelConfigForRole('"https://x/y"', "VIEWER"), JSON.stringify(HIDDEN_VALUE));
  });
});

describe("CY-03: container command arguments and host mount paths are admin-only", () => {
  const detail = {
    id: "abc",
    hostId: "local",
    provider: "DOCKER",
    name: "redis",
    image: "redis:7-alpine",
    state: "running",
    status: "running",
    createdAt: "2026-11-28T00:00:00.000Z",
    labels: {},
    networks: [],
    ports: [],
    command: "redis-server --requirepass s3cr3t-pass --appendonly yes",
    env: [{ key: "REDISCLI_AUTH", value: "s3cr3t-pass" }],
    mounts: [{ source: "/srv/data/redis", destination: "/data", mode: "rw", rw: true }],
  } as unknown as ContainerDetail;

  test("VIEWER sees the executable, container paths and env names only", () => {
    const out = containerDetailForRole(detail, "VIEWER");
    assert.equal(out.command, `redis-server ${HIDDEN_VALUE}`);
    assert.ok(!JSON.stringify(out).includes("s3cr3t-pass"));
    assert.equal(out.mounts[0].source, HIDDEN_VALUE);
    assert.equal(out.mounts[0].destination, "/data");
    assert.deepEqual(out.env, [{ key: "REDISCLI_AUTH", value: HIDDEN_VALUE }]);
  });

  test("ADMIN sees the full detail", () => {
    const out = containerDetailForRole(detail, "ADMIN");
    assert.equal(out.command, detail.command);
    assert.deepEqual(out.mounts, detail.mounts);
    assert.deepEqual(out.env, detail.env);
  });
});

describe("CY-04: .env.example placeholder secrets are refused at startup", () => {
  test("every placeholder shipped in .env.example is detected", () => {
    const example = fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
    for (const key of ["SESSION_SECRET", "ADMIN_PASSWORD", "REDIS_PASSWORD"]) {
      const line = example.split("\n").find((l) => l.startsWith(`${key}=`));
      assert.ok(line, `${key} missing from .env.example`);
      assert.equal(isPlaceholderSecret(line.slice(key.length + 1)), true, `${key} placeholder not detected`);
    }
  });

  test("real values pass, and REDIS_URL passwords are checked", () => {
    assert.equal(isPlaceholderSecret("0123456789abcdef0123456789abcdef"), false);
    assert.equal(isPlaceholderSecret(undefined), false);
    assert.equal(redisUrlHasPlaceholderPassword("redis://:change-me-redis-password@redis:6379/0"), true);
    assert.equal(redisUrlHasPlaceholderPassword("redis://:Zx81-real-pass@redis:6379/0"), false);
    assert.equal(redisUrlHasPlaceholderPassword("redis://127.0.0.1:6379"), false);
  });

  test("docker/entrypoint.sh refuses the placeholders before seeding", () => {
    const script = path.resolve(process.cwd(), "docker/entrypoint.sh");
    const r = spawnSync("bash", [script], {
      env: {
        PATH: process.env.PATH ?? "",
        SESSION_SECRET: "x".repeat(40),
        DATABASE_URL: "file:/nonexistent/app.db",
        REDIS_URL: "redis://:real-pass@redis:6379/0",
        ALLOWED_ORIGINS: "https://example.com",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "change-me-please",
        REDIS_PASSWORD: "real-pass",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ADMIN_PASSWORD is still set to the \.env\.example placeholder/);
  });
});

describe("CY-21: cAdvisor container path check is anchored at both ends", () => {
  const ID = "0123456789abcdef".repeat(4);
  test("real cgroup v1/v2 names, including nested parents, still match", () => {
    assert.equal(isDockerContainerPath(`/docker/${ID}`), true);
    assert.equal(isDockerContainerPath(`/system.slice/docker-${ID}.scope`), true);
    assert.equal(isDockerContainerPath(`/kubepods.slice/pod_1/docker-${ID}.scope`), true);
  });
  test("traversal, query and fragment tricks are rejected", () => {
    for (const bad of [
      `/../../x?y=/docker/${ID}`,
      `/../metrics/docker/${ID}`,
      `/a/./docker/${ID}`,
      `/a?b/docker/${ID}`,
      `/a#b/docker/${ID}`,
      `/a%2Fb/docker/${ID}`,
      `docker/${ID}`,
    ]) {
      assert.equal(isDockerContainerPath(bad), false, bad);
    }
  });
});

describe("CY-20: CSV export neutralises spreadsheet formulas", () => {
  test("fields starting with = + - @ TAB or CR get a leading quote", () => {
    assert.equal(escapeCsvField("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(escapeCsvField("+1"), "'+1");
    assert.equal(escapeCsvField("-2"), "'-2");
    assert.equal(escapeCsvField("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(escapeCsvField("\tcmd"), "'\tcmd");
  });
  test("ordinary values are unchanged, commas still quoted", () => {
    assert.equal(escapeCsvField("web-1"), "web-1");
    assert.equal(escapeCsvField("a,b"), '"a,b"');
  });
});

describe("CY-06: metrics windows are capped at the documented 90 days", () => {
  test("days above the cap are clamped, the UI choices are unchanged", () => {
    assert.equal(MAX_METRICS_DAYS, 90);
    assert.equal(safeParseInt("365", 7, MAX_METRICS_DAYS), 90);
    for (const d of ["7", "30", "90"]) assert.equal(safeParseInt(d, 7, MAX_METRICS_DAYS), Number(d));
  });
});

describe("CY-22: monitoring tables are pruned", () => {
  test("metrics default to 90 days; alert history only when opted in", async () => {
    const { prisma } = await import("../../src/db/client");
    assert.ok(prisma);
    const calls: Array<{ table: string; cutoff: Date }> = [];
    Object.assign(prisma.containerMetricsHourly, {
      deleteMany: async ({ where }: { where: { aggregatedAt: { lt: Date } } }) => {
        calls.push({ table: "metrics", cutoff: where.aggregatedAt.lt });
        return { count: 3 };
      },
    });
    Object.assign(prisma.alertHistory, {
      deleteMany: async ({ where }: { where: { createdAt: { lt: Date } } }) => {
        calls.push({ table: "history", cutoff: where.createdAt.lt });
        return { count: 2 };
      },
    });
    const { pruneMonitoring } = await import("../../src/services/retention");
    const now = Date.UTC(2026, 10, 28);
    const day = 24 * 60 * 60 * 1000;

    assert.deepEqual(await pruneMonitoring({}, now), { metrics: 3, alertHistory: 0 });
    assert.deepEqual(calls, [{ table: "metrics", cutoff: new Date(now - 90 * day) }]);

    calls.length = 0;
    assert.deepEqual(
      await pruneMonitoring({ METRICS_RETENTION_DAYS: "0", ALERT_HISTORY_RETENTION_DAYS: "30" }, now),
      { metrics: 0, alertHistory: 2 },
    );
    assert.deepEqual(calls, [{ table: "history", cutoff: new Date(now - 30 * day) }]);
  });
});

describe("CY-24: cAdvisor URLs are logged without credentials", () => {
  test("userinfo and query string are stripped", () => {
    assert.equal(urlForLog("http://user:pa55w0rd@cadvisor.example:8080/base/?token=abc"), "http://cadvisor.example:8080/base/");
    assert.equal(urlForLog("https://cadvisor.example"), "https://cadvisor.example");
    assert.equal(urlForLog("not a url with secret"), "<invalid URL>");
  });
});

describe("CY-10: SSE heartbeats end streams whose session is gone from the store", () => {
  test("sessionStillStored follows the store, not the request's own copy", async () => {
    const { sessionStillStored } = await import("../../src/lib/sseGuard");
    const store = new Map<string, unknown>([["sid-1", { user: { id: "u1" } }]]);
    const req = {
      session: { user: { id: "u1" } },
      sessionID: "sid-1",
      sessionStore: { get: (id: string, cb: (e: unknown, d: unknown) => void) => cb(null, store.get(id) ?? null) },
    } as unknown as import("express").Request;
    assert.equal(await sessionStillStored(req), true);
    store.delete("sid-1"); // logout / expiry
    assert.equal(await sessionStillStored(req), false);
    assert.equal(await sessionStillStored({ session: {} } as unknown as import("express").Request), false);
  });
});

describe("CY-07: AUTH_DISABLED is development-only and server-side only", () => {
  test("refused in production, warned otherwise, VITE_ alias ignored", async () => {
    const { checkAuthDisabledPolicy, isAuthDisabled } = await import("../../src/lib/authDisabled");
    assert.throws(() => checkAuthDisabledPolicy({ AUTH_DISABLED: "true", NODE_ENV: "production" }), /not allowed/);
    assert.equal(checkAuthDisabledPolicy({ AUTH_DISABLED: "true", NODE_ENV: "development" }).length, 1);
    assert.equal(isAuthDisabled({ VITE_AUTH_DISABLED: "true" }), false);
    assert.match(checkAuthDisabledPolicy({ VITE_AUTH_DISABLED: "true", NODE_ENV: "production" })[0], /client build flag/);
    assert.deepEqual(checkAuthDisabledPolicy({ NODE_ENV: "production" }), []);
  });

  test("the env module refuses to load with AUTH_DISABLED in production", () => {
    const envModule = pathToFileURL(path.resolve(process.cwd(), "server/src/config/env.ts")).href;
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(envModule)}); console.log("ENV_OK");`],
      {
        env: {
          PATH: process.env.PATH ?? "",
          NODE_ENV: "production",
          AUTH_DISABLED: "true",
          SESSION_SECRET: "0123456789abcdef0123456789abcdef",
          ALLOWED_ORIGINS: "https://example.com",
          REDIS_URL: "redis://127.0.0.1:6379",
          ADMIN_EMAIL: "admin@example.com",
          ADMIN_PASSWORD: "TestAdminPassword123!",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.notEqual(r.status, 0);
    assert.ok(!r.stdout.includes("ENV_OK"));
    assert.match(r.stderr, /AUTH_DISABLED=true is not allowed/);
  });

  test("the SSE guard no longer trusts the magic user id when auth is on", async () => {
    const { isSseSessionValid } = await import("../../src/lib/sseGuard");
    const req = { session: { user: { id: "auth-disabled" } } } as unknown as import("express").Request;
    assert.equal(await isSseSessionValid(req), false);
  });
});

describe("CY-08: ADMIN_PASSWORD is only required for the first boot", () => {
  const envModule = pathToFileURL(path.resolve(process.cwd(), "server/src/config/env.ts")).href;
  const baseEnv = {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    ALLOWED_ORIGINS: "https://example.com",
    REDIS_URL: "redis://127.0.0.1:6379",
    ADMIN_EMAIL: "admin@example.com",
  };
  const load = (extra: Record<string, string>) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(envModule)}); console.log("ENV_OK");`],
      { env: { ...baseEnv, ...extra }, encoding: "utf8", timeout: 30_000 },
    );

  test("the server starts without ADMIN_PASSWORD", () => {
    const r = load({});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ENV_OK/);
  });

  test("a set ADMIN_PASSWORD is still validated", () => {
    assert.notEqual(load({ ADMIN_PASSWORD: "short" }).status, 0);
  });

  test("the entrypoint no longer requires ADMIN_PASSWORD", () => {
    const script = fs.readFileSync(path.resolve(process.cwd(), "docker/entrypoint.sh"), "utf8");
    const required = script.slice(script.indexOf("required_vars=("), script.indexOf(")", script.indexOf("required_vars=(")));
    assert.ok(!required.includes("ADMIN_PASSWORD"));
  });
});
