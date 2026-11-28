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
import { clampLogTail, MAX_LOG_TAIL } from "../../src/services/docker";
import { isDockerContainerPath } from "../../src/services/cadvisor";
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
