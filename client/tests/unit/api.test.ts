import { test } from "node:test";
import assert from "node:assert/strict";
import { API_BASE, ApiError, apiFetch } from "../../src/lib/api";
import { header, json, stubFetch, text } from "./_fetchStub";

function apiError(check: (e: ApiError) => boolean) {
  return (e: unknown) => e instanceof ApiError && check(e);
}

test("without a runtime or build-time base, requests go to /api", () => {
  assert.equal(API_BASE, "/api");
});

test("paths are normalised under /api, absolute URLs pass through", async (t) => {
  const calls = stubFetch(t, () => json(200, {}));
  for (const p of ["/hosts", "hosts", "/api/hosts", "//hosts"]) await apiFetch(p);
  await apiFetch("https://example.invalid/x");
  assert.deepEqual(calls.map((c) => c.url), ["/api/hosts", "/api/hosts", "/api/hosts", "/api/hosts", "https://example.invalid/x"]);
});

test("sends Accept: application/json, keeps caller headers, includes credentials", async (t) => {
  const calls = stubFetch(t, () => json(200, {}));
  await apiFetch("/hosts", { headers: { "X-Extra": "1" } });
  const { init } = calls[0];
  assert.equal(header(init, "Accept"), "application/json");
  assert.equal(header(init, "X-Extra"), "1");
  assert.equal(init.credentials, "include");
  assert.equal(init.cache, undefined);
});

test("auth endpoints are never cached", async (t) => {
  const calls = stubFetch(t, () => json(200, {}));
  await apiFetch("/auth/me");
  assert.equal(calls[0].init.cache, "no-store");
});

test("an error JSON body becomes ApiError(status) with the body kept", async (t) => {
  stubFetch(t, () => json(409, { error: "conflict" }));
  await assert.rejects(
    apiFetch("/hosts"),
    apiError((e) => e.status === 409 && e.body === '{"error":"conflict"}' && /^API Error 409: /.test(e.message)),
  );
});

test("an HTML error page (proxy 502) gets a readable message and a capped body", async (t) => {
  stubFetch(t, () => text(502, `<!DOCTYPE html><html>${"x".repeat(2000)}</html>`, "text/html"));
  await assert.rejects(
    apiFetch("/hosts"),
    apiError((e) => e.status === 502 && e.message === "API unavailable (502). The server may be offline." && e.body.length === 500),
  );
});

test("a 200 that is not JSON is rejected as not-json", async (t) => {
  stubFetch(t, () => text(200, "<html>login</html>", "text/html; charset=utf-8"));
  await assert.rejects(
    apiFetch("/hosts"),
    apiError((e) => e.status === "not-json" && e.message.startsWith("Expected JSON response but got text/html @ /api/hosts")),
  );
});

test("network failures become ApiError('network')", async (t) => {
  stubFetch(t, () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(apiFetch("/hosts"), apiError((e) => e.status === "network" && e.message === "fetch failed"));
});
