import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  getFirebaseAllowedEmails,
  getFirebasePublicConfig,
  isFirebaseEnabled,
  validateFirebaseConfig,
  verifyFirebaseLogin,
} from "../../src/services/firebaseAuth";
import { buildCsp, buildHelmetOptions } from "../../src/lib/csp";
import { HttpError } from "../../src/lib/httpError";

const BASE_ENABLED_ENV: NodeJS.ProcessEnv = {
  FIREBASE_ENABLED: "true",
  FIREBASE_PROJECT_ID: "containeryard-prod",
  FIREBASE_CLIENT_API_KEY: "test-public-web-api-key",
  FIREBASE_CLIENT_AUTH_DOMAIN: "containeryard-prod.firebaseapp.com",
  FIREBASE_CLIENT_APP_ID: "1:123456:web:abcdef",
  FIREBASE_ALLOWED_EMAILS: "You@Example.com, admin@example.com, you@example.com",
};

function decodedToken(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  return {
    aud: "containeryard-prod",
    auth_time: 1_700_000_000,
    exp: 1_900_000_000,
    iat: 1_700_000_000,
    iss: "https://securetoken.google.com/containeryard-prod",
    sub: "uid-123",
    uid: "uid-123",
    email: "you@example.com",
    email_verified: true,
    name: "Test Operator",
    firebase: {
      identities: { "google.com": ["12345"], email: ["you@example.com"] },
      sign_in_provider: "google.com",
    },
    ...overrides,
  } as DecodedIdToken;
}

describe("firebaseAuth config & allowlist", () => {
  test("getFirebaseAllowedEmails trims, lowercases, and deduplicates", () => {
    assert.deepEqual(getFirebaseAllowedEmails(BASE_ENABLED_ENV), [
      "you@example.com",
      "admin@example.com",
    ]);
    assert.deepEqual(getFirebaseAllowedEmails({}), []);
  });

  test("disabled by default; getFirebasePublicConfig omits client keys when disabled", () => {
    assert.equal(isFirebaseEnabled({}), false);
    assert.deepEqual(getFirebasePublicConfig({}), { enabled: false });
  });

  test("enabled with incomplete client config warns and treats as disabled", () => {
    const warnings: string[] = [];
    const res = validateFirebaseConfig(
      { FIREBASE_ENABLED: "true", FIREBASE_PROJECT_ID: "containeryard-prod" },
      (m) => warnings.push(m),
    );
    assert.equal(res.enabled, false);
    assert.equal(warnings.length, 1);
  });

  test("validates service-account JSON file existence and project_id match without leaking contents", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cy-fb-sa-"));
    const goodPath = path.join(dir, "good.json");
    const wrongProjPath = path.join(dir, "wrong.json");
    const secretMarker = "PRIVATE-KEY-DO-NOT-LOG-999";
    try {
      fs.writeFileSync(
        goodPath,
        JSON.stringify({ type: "service_account", project_id: "containeryard-prod", private_key: secretMarker }),
      );
      fs.writeFileSync(
        wrongProjPath,
        JSON.stringify({ type: "service_account", project_id: "other-proj", private_key: secretMarker }),
      );

      assert.equal(
        isFirebaseEnabled({ ...BASE_ENABLED_ENV, FIREBASE_SERVICE_ACCOUNT_PATH: goodPath }),
        true,
      );

      const warnings: string[] = [];
      const badProj = validateFirebaseConfig(
        { ...BASE_ENABLED_ENV, FIREBASE_SERVICE_ACCOUNT_PATH: wrongProjPath },
        (m) => warnings.push(m),
      );
      assert.equal(badProj.enabled, false);
      assert.equal(warnings.some((w) => w.includes(secretMarker)), false);

      const missing = validateFirebaseConfig(
        { ...BASE_ENABLED_ENV, FIREBASE_SERVICE_ACCOUNT_PATH: path.join(dir, "missing.json") },
        (m) => warnings.push(m),
      );
      assert.equal(missing.enabled, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("getFirebasePublicConfig exposes only public web config, never allowed emails", () => {
    const pub = getFirebasePublicConfig(BASE_ENABLED_ENV);
    assert.deepEqual(pub, {
      enabled: true,
      apiKey: "test-public-web-api-key",
      authDomain: "containeryard-prod.firebaseapp.com",
      projectId: "containeryard-prod",
      appId: "1:123456:web:abcdef",
    });
    assert.equal(JSON.stringify(pub).includes("you@example.com"), false);
  });
});

describe("verifyFirebaseLogin", () => {
  test("valid allowlisted verified Google token passes with checkRevoked=true", async () => {
    let sawCheckRevoked = false;
    const user = await verifyFirebaseLogin("valid-token", BASE_ENABLED_ENV, async (_t, checkRevoked) => {
      sawCheckRevoked = checkRevoked;
      return decodedToken({ email: "YOU@EXAMPLE.COM" });
    });
    assert.equal(sawCheckRevoked, true);
    assert.deepEqual(user, { email: "you@example.com", uid: "uid-123", name: "Test Operator" });
  });

  test("disabled -> 503", async () => {
    await assert.rejects(
      () => verifyFirebaseLogin("tok", {}, async () => decodedToken()),
      (err: unknown) => err instanceof HttpError && err.status === 503,
    );
  });

  test("unverified email -> 403", async () => {
    await assert.rejects(
      () =>
        verifyFirebaseLogin("tok", BASE_ENABLED_ENV, async () =>
          decodedToken({ email_verified: false }),
        ),
      (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === "email_unverified",
    );
  });

  test("non-google provider (e.g. password) -> 403", async () => {
    await assert.rejects(
      () =>
        verifyFirebaseLogin("tok", BASE_ENABLED_ENV, async () =>
          decodedToken({
            firebase: { identities: {}, sign_in_provider: "password" },
          } as Partial<DecodedIdToken>),
        ),
      (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === "unsupported_provider",
    );
  });

  test("not allowlisted -> 403 naming caller email but never listing allowlist", async () => {
    await assert.rejects(
      () =>
        verifyFirebaseLogin("tok", BASE_ENABLED_ENV, async () =>
          decodedToken({ email: "intruder@example.com" }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 403);
        assert.ok(err.message.includes("intruder@example.com"));
        assert.equal(err.message.includes("admin@example.com"), false);
        return true;
      },
    );
  });

  test("empty allowlist -> 403", async () => {
    await assert.rejects(
      () =>
        verifyFirebaseLogin(
          "tok",
          { ...BASE_ENABLED_ENV, FIREBASE_ALLOWED_EMAILS: "" },
          async () => decodedToken(),
        ),
      (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === "empty_allowlist",
    );
  });

  test("revoked or invalid token (verifier throws) -> 401", async () => {
    await assert.rejects(
      () =>
        verifyFirebaseLogin("revoked-token", BASE_ENABLED_ENV, async () => {
          throw new Error("auth/id-token-revoked");
        }),
      (err: unknown) => err instanceof HttpError && err.status === 401,
    );
  });
});

describe("buildCsp and buildHelmetOptions", () => {
  test("off in production matches v5.2.0 policy byte for byte with no COOP override", () => {
    const envOff = { NODE_ENV: "production" };
    const csp = buildCsp(envOff);
    assert.deepEqual(csp, {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    });
    const helmetOpts = buildHelmetOptions(envOff);
    assert.equal("crossOriginOpenerPolicy" in helmetOpts, false);
  });

  test("on in production scopes origins to configured authDomain and sets COOP same-origin-allow-popups", () => {
    const envOn = { NODE_ENV: "production", ...BASE_ENABLED_ENV };
    const csp = buildCsp(envOn);
    assert.ok(csp && typeof csp === "object");
    assert.deepEqual(csp.directives.scriptSrc, [
      "'self'",
      "https://apis.google.com",
      "https://www.gstatic.com",
      "https://containeryard-prod.firebaseapp.com",
    ]);
    assert.deepEqual(csp.directives.connectSrc, [
      "'self'",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://www.googleapis.com",
      "https://apis.google.com",
      "https://containeryard-prod.firebaseapp.com",
    ]);
    assert.deepEqual(csp.directives.frameSrc, [
      "'self'",
      "https://containeryard-prod.firebaseapp.com",
      "https://accounts.google.com",
    ]);
    assert.deepEqual(csp.directives.imgSrc, [
      "'self'",
      "data:",
      "blob:",
      "https://*.googleusercontent.com",
      "https://www.gstatic.com",
    ]);
    // Must not use wildcard *.firebaseapp.com
    assert.equal(JSON.stringify(csp).includes("*.firebaseapp.com"), false);

    const helmetOpts = buildHelmetOptions(envOn);
    assert.deepEqual(helmetOpts.crossOriginOpenerPolicy, { policy: "same-origin-allow-popups" });
  });

  test("non-production returns false for CSP", () => {
    assert.equal(buildCsp({ NODE_ENV: "development", ...BASE_ENABLED_ENV }), false);
  });
});
