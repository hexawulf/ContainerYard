import "./_testEnv";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertDockerContainerRef } from "../../src/services/docker";
import { loginSchema, changePasswordSchema } from "../../src/types/zod";
import { verifyCsrf, isAllowedOrigin, tokensMatch } from "../../src/middleware/csrf";
import {
  acquireSseStreamSlot,
  getActiveSseStreamCount,
  resetSseStreamCountsForTests,
  MAX_SSE_STREAMS_PER_USER,
} from "../../src/lib/sseGuard";

describe("Security Audit Hardening (PR 1)", () => {
  describe("CY-A01: Docker Engine socket containerId path-injection guard", () => {
    test("accepts valid short and 64-char hex IDs and Docker container names", () => {
      assert.doesNotThrow(() => assertDockerContainerRef("a1b2c3d4e5f6"));
      assert.doesNotThrow(() => assertDockerContainerRef("0123456789abcdef".repeat(4)));
      assert.doesNotThrow(() => assertDockerContainerRef("cy-test-audit_1.service"));
    });

    test("rejects slashes, URL-decoded path segments, query strings, dots, and overlong inputs", () => {
      const malicious = [
        "",
        "../json",
        "abc123def456/json?",
        "abc123def456/top#",
        "-flag-injection",
        ".leading-dot",
        "container with spaces",
        "a\nb",
        "a".repeat(129),
      ];
      for (const input of malicious) {
        assert.throws(
          () => assertDockerContainerRef(input),
          (err: any) => err?.status === 400 && /Invalid container id/.test(err.message),
          `Expected ${JSON.stringify(input)} to be rejected with 400`
        );
      }
    });
  });

  describe("CY-A02: Password length cap against bcrypt CPU DoS", () => {
    test("loginSchema and changePasswordSchema accept normal passwords and reject >1024 chars", () => {
      const okLogin = loginSchema.safeParse({
        email: "user@example.com",
        password: "ValidPassword_2026!",
      });
      assert.equal(okLogin.success, true);

      const hugeLogin = loginSchema.safeParse({
        email: "user@example.com",
        password: "A".repeat(1025),
      });
      assert.equal(hugeLogin.success, false);

      const hugeChange = changePasswordSchema.safeParse({
        currentPassword: "A".repeat(1025),
        newPassword: "ValidPassword_2026!",
      });
      assert.equal(hugeChange.success, false);

      const hugeNewChange = changePasswordSchema.safeParse({
        currentPassword: "ValidPassword_2026!",
        newPassword: "B".repeat(1025),
      });
      assert.equal(hugeNewChange.success, false);
    });
  });

  describe("CY-A03: CSRF Origin verification and constant-time token comparison", () => {
    test("isAllowedOrigin accepts missing Origin and configured origins, rejects foreign Origin", () => {
      const allowed = ["https://containeryard.org"];
      assert.equal(isAllowedOrigin(undefined, "containeryard.org", allowed), true);
      assert.equal(isAllowedOrigin("https://containeryard.org", undefined, allowed), true);
      assert.equal(isAllowedOrigin("https://app.example.test", "app.example.test", allowed), true);
      assert.equal(isAllowedOrigin("https://evil.example.com", "containeryard.org", allowed), false);
    });

    test("verifyCsrf rejects POST with valid CSRF token when Origin is untrusted", () => {
      const token = "a".repeat(64);
      let nextCalled = false;
      let statusCode = 200;
      let body: any = null;

      const req: any = {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          host: "containeryard.org",
          "x-csrf-token": token,
        },
        session: { csrfToken: token },
      };
      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          body = payload;
          return this;
        },
      };

      verifyCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(statusCode, 403);
      assert.equal(body?.code, "EBADORIGIN");
    });

    test("tokensMatch compares equal-length tokens in constant time and rejects mismatches", () => {
      assert.equal(tokensMatch("secret-metrics-token-123", "secret-metrics-token-123"), true);
      assert.equal(tokensMatch("secret-metrics-token-123", "secret-metrics-token-124"), false);
      assert.equal(tokensMatch("short", "longer-token"), false);
    });
  });

  describe("CY-A05: Per-user SSE concurrency limit", () => {
    test("allows up to MAX_SSE_STREAMS_PER_USER concurrent streams and rejects the next one", () => {
      resetSseStreamCountsForTests();
      const releases: Array<() => void> = [];
      for (let i = 0; i < MAX_SSE_STREAMS_PER_USER; i++) {
        const release = acquireSseStreamSlot("user-1");
        assert.equal(typeof release, "function");
        releases.push(release!);
      }
      assert.equal(getActiveSseStreamCount("user-1"), MAX_SSE_STREAMS_PER_USER);
      assert.equal(acquireSseStreamSlot("user-1"), null);

      // Another user is unaffected
      const otherRelease = acquireSseStreamSlot("user-2");
      assert.equal(typeof otherRelease, "function");
      otherRelease!();

      // Releasing one slot allows user-1 to open a stream again
      releases.pop()!();
      assert.equal(getActiveSseStreamCount("user-1"), MAX_SSE_STREAMS_PER_USER - 1);
      const nextRelease = acquireSseStreamSlot("user-1");
      assert.equal(typeof nextRelease, "function");
      nextRelease!();
      for (const r of releases) r();
      assert.equal(getActiveSseStreamCount("user-1"), 0);
    });
  });
});
