/**
 * Regression tests for the 2026-11-28 security audit
 * (docs/security/SECURITY_AUDIT_2026-11-28.md). One describe block per finding.
 */
import "./_testEnv";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clampLogTail, MAX_LOG_TAIL } from "../../src/services/docker";
import { channelConfigForRole, containerDetailForRole, HIDDEN_VALUE } from "../../src/lib/redact";
import type { ContainerDetail } from "../../src/models/containers";

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
