import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { ApiError } from "../../src/lib/api";
import { apiRequest, clearCsrfToken, getQueryFn, prefetchCsrfToken } from "../../src/lib/queryClient";
import { header, json, stubFetch, text, type FetchCall } from "./_fetchStub";

let tokenCount = 0;

beforeEach(() => {
  clearCsrfToken();
  tokenCount = 0;
});

/** Server stub: hands out tok-1, tok-2… at /api/auth/csrf; everything else goes to `rest`. */
function server(rest: (url: string, init: RequestInit) => Response) {
  return (url: string, init: RequestInit) =>
    url === "/api/auth/csrf" ? json(200, { csrfToken: `tok-${++tokenCount}` }) : rest(url, init);
}

const csrfCalls = (calls: FetchCall[]) => calls.filter((c) => c.url === "/api/auth/csrf").length;

test("GET sends no CSRF token and fetches none", async (t) => {
  const calls = stubFetch(t, server(() => json(200, { ok: true })));
  await apiRequest("get", "/hosts");
  assert.equal(csrfCalls(calls), 0);
  assert.equal(header(calls[0].init, "x-csrf-token"), undefined);
  assert.equal(calls[0].init.method, "GET");
});

test("POST gets a token once, then reuses it; JSON body and content type are set", async (t) => {
  const calls = stubFetch(t, server(() => json(200, {})));
  await apiRequest("POST", "/hosts/local/containers/web/actions", { action: "stop" });
  await apiRequest("DELETE", "/bookmarks/1");
  const posts = calls.filter((c) => c.url !== "/api/auth/csrf");
  assert.equal(csrfCalls(calls), 1);
  assert.deepEqual(posts.map((c) => header(c.init, "x-csrf-token")), ["tok-1", "tok-1"]);
  assert.equal(header(posts[0].init, "Content-Type"), "application/json");
  assert.equal(posts[0].init.body, '{"action":"stop"}');
  assert.equal(posts[1].init.body, undefined);
});

test("a stale token (403 mentioning CSRF) is refreshed and the request retried once", async (t) => {
  let attempts = 0;
  const calls = stubFetch(
    t,
    server((_url, init) => {
      attempts++;
      return header(init, "x-csrf-token") === "tok-2" ? json(200, { done: true }) : json(403, { error: "Invalid CSRF token" });
    }),
  );
  await prefetchCsrfToken(); // tok-1 cached, then the server session rotates
  const res = await apiRequest("POST", "/auth/password", { password: "x" });
  assert.deepEqual(await res.json(), { done: true });
  assert.equal(attempts, 2);
  assert.equal(csrfCalls(calls), 2);
});

test("the CSRF retry happens at most once", async (t) => {
  let attempts = 0;
  stubFetch(t, server(() => (attempts++, json(403, { error: "Invalid CSRF token" }))));
  await assert.rejects(apiRequest("POST", "/x", {}), (e: unknown) => e instanceof ApiError && e.status === 403);
  assert.equal(attempts, 2);
});

test("a 403 that is not about CSRF is not retried", async (t) => {
  let attempts = 0;
  stubFetch(t, server(() => (attempts++, json(403, { error: "Container actions require the ADMIN role" }))));
  await assert.rejects(apiRequest("POST", "/x", {}), (e: unknown) => e instanceof ApiError && e.status === 403);
  assert.equal(attempts, 1);
});

test("a caller-supplied token is used as is and never retried", async (t) => {
  let attempts = 0;
  const calls = stubFetch(t, server(() => (attempts++, json(403, { error: "Invalid CSRF token" }))));
  await assert.rejects(apiRequest("POST", "/x", {}, { headers: { "x-csrf-token": "mine" } }));
  assert.equal(attempts, 1);
  assert.equal(csrfCalls(calls), 0);
  assert.equal(header(calls[0].init, "x-csrf-token"), "mine");
});

test("skipCsrf sends no token", async (t) => {
  const calls = stubFetch(t, server(() => json(200, {})));
  await apiRequest("POST", "/auth/login", { email: "a" }, { skipCsrf: true });
  assert.equal(csrfCalls(calls), 0);
  assert.equal(header(calls[0].init, "x-csrf-token"), undefined);
});

test("a missing method is a programming error", async () => {
  await assert.rejects(apiRequest("", "/x"), /method parameter is required/);
});

function ctx(queryKey: readonly unknown[]): QueryFunctionContext {
  return { queryKey, signal: new AbortController().signal, meta: undefined } as unknown as QueryFunctionContext;
}

test("query keys become paths; cAdvisor ids with slashes are encoded; objects are skipped", async (t) => {
  const calls = stubFetch(t, () => json(200, [1]));
  const fn = getQueryFn<number[]>({ on401: "throw" });
  const data = await fn(ctx(["/api/hosts", "nas", "containers", "/system.slice/docker-ab.scope", { tail: 5 }, "stats"]));
  assert.deepEqual(data, [1]);
  assert.equal(calls[0].url, "/api/hosts/nas/containers/%2Fsystem.slice%2Fdocker-ab.scope/stats");
});

test("on401: returnNull gives null, throw rethrows; other errors always throw", async (t) => {
  stubFetch(t, (url) => (url.endsWith("/me") ? json(401, { error: "no session" }) : text(500, "boom")));
  assert.equal(await getQueryFn({ on401: "returnNull" })(ctx(["/api/auth/me"])), null);
  await assert.rejects(async () => getQueryFn({ on401: "throw" })(ctx(["/api/auth/me"])), (e: unknown) => e instanceof ApiError && e.status === 401);
  await assert.rejects(async () => getQueryFn({ on401: "returnNull" })(ctx(["/api/hosts"])), (e: unknown) => e instanceof ApiError && e.status === 500);
});
