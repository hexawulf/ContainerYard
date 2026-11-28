/**
 * Regression tests for the 2026-11-28 security audit
 * (docs/security/SECURITY_AUDIT_2026-11-28.md). One describe block per finding.
 */
import "./_testEnv";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clampLogTail, MAX_LOG_TAIL } from "../../src/services/docker";

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
