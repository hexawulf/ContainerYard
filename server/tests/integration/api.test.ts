/**
 * Integration tests against a running ContainerYard instance.
 * (Replaces the old Jest specs, which targeted removed routes and predated auth/CSRF.)
 *
 *   CY_BASE_URL=http://127.0.0.1:5098 \
 *   CY_TEST_EMAIL=admin@example.com CY_TEST_PASSWORD=... \
 *   CY_TEST_HOST=piapps CY_TEST_CONTAINER=cy-test-busybox \
 *   CY_TEST_ALLOW_ACTIONS=1 \
 *   npm run test:integration
 *
 * Without CY_TEST_EMAIL/CY_TEST_PASSWORD every test is skipped. Container
 * actions only run with CY_TEST_ALLOW_ACTIONS=1 AND a container whose name
 * starts with "cy-test", so the suite can never stop a real workload.
 * A throwaway container: docker run -d --name cy-test-busybox busybox \
 *   sh -c 'i=0; while true; do echo "tick $i ☃"; i=$((i+1)); sleep 1; done'
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE = (process.env.CY_BASE_URL ?? "http://127.0.0.1:5008").replace(/\/+$/, "");
const EMAIL = process.env.CY_TEST_EMAIL;
const PASSWORD = process.env.CY_TEST_PASSWORD;
const HOST = process.env.CY_TEST_HOST ?? "piapps";
const CONTAINER = process.env.CY_TEST_CONTAINER;
const ALLOW_ACTIONS = process.env.CY_TEST_ALLOW_ACTIONS === "1" && !!CONTAINER?.startsWith("cy-test");

const skipAll = !EMAIL || !PASSWORD ? "set CY_TEST_EMAIL and CY_TEST_PASSWORD" : false;
const skipContainer = skipAll || (!CONTAINER ? "set CY_TEST_CONTAINER" : false);
const skipActions = skipContainer || (!ALLOW_ACTIONS ? "set CY_TEST_ALLOW_ACTIONS=1 and use a cy-test* container" : false);

/** Minimal cookie-jar client. Secure cookies over plain http need X-Forwarded-Proto. */
class Client {
  private cookies = new Map<string, string>();
  csrf = "";

  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    headers.set("X-Forwarded-Proto", "https");
    if (this.cookies.size) headers.set("Cookie", Array.from(this.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const res = await fetch(BASE + path, { ...init, headers, body, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }

  async refreshCsrf() {
    this.csrf = ((await (await this.req("/api/auth/csrf")).json()) as { csrfToken: string }).csrfToken;
  }

  mutate(path: string, method: string, json?: unknown, csrf = this.csrf) {
    return this.req(path, { method, json, headers: csrf ? { "x-csrf-token": csrf } : {} });
  }
}

const admin = new Client();
let containerId = "";

before(async () => {
  if (skipAll) return;
  await admin.refreshCsrf();
  const res = await admin.mutate("/api/auth/login", "POST", { email: EMAIL, password: PASSWORD });
  assert.equal(res.status, 200, "login failed: check CY_TEST_EMAIL / CY_TEST_PASSWORD");
  await admin.refreshCsrf(); // the session is regenerated on login
  if (CONTAINER) {
    const list = (await (await admin.req(`/api/hosts/${HOST}/containers`)).json()) as Array<{ id: string; name: string }>;
    containerId = list.find((c) => c.name === CONTAINER)?.id ?? "";
  }
});

// ---------- public / auth ----------

test("health is public", { skip: skipAll }, async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { ok: boolean }).ok, true);
});

test("CSRF: mutating request without a token is rejected", { skip: skipAll }, async () => {
  const anon = new Client();
  const res = await anon.mutate("/api/auth/login", "POST", { email: "x@y.z", password: "x".repeat(12) }, "");
  assert.equal(res.status, 403);
});

test("protected routes need a session", { skip: skipAll }, async () => {
  const anon = new Client();
  for (const p of [`/api/hosts/${HOST}/containers`, "/api/bookmarks", "/api/saved-searches", "/api/audit", `/api/hosts/${HOST}/logs`]) {
    assert.equal((await anon.req(p)).status, 401, p);
  }
});

test("GET /api/auth/me returns the admin", { skip: skipAll }, async () => {
  const me = (await (await admin.req("/api/auth/me")).json()) as { user: { role: string } };
  assert.equal(me.user.role, "ADMIN");
});

// ---------- container logs / stats ----------

test("container logs snapshot (tail, since, grep)", { skip: skipContainer }, async () => {
  assert.ok(containerId, `container ${CONTAINER} not found on ${HOST}`);
  const base = `/api/hosts/${HOST}/containers/${containerId}/logs`;
  const all = (await (await admin.req(`${base}?tail=5000&since=3600s`)).json()) as { content: string };
  assert.equal(typeof all.content, "string");
  assert.ok(all.content.length > 0);
  // eslint-disable-next-line no-control-regex -- deliberately looking for Docker frame-header bytes
  assert.doesNotMatch(all.content, /[\x00-\x08]/, "demux leaked header bytes");
  const recent = (await (await admin.req(`${base}?tail=5000&since=5s`)).json()) as { content: string };
  assert.ok(recent.content.split("\n").length < all.content.split("\n").length, "since filter had no effect");
  const grep = (await (await admin.req(`${base}?tail=200&grep=tick`)).json()) as { content: string };
  for (const line of grep.content.split("\n").filter(Boolean)) assert.match(line, /tick/i);
});

test("container stats are numeric", { skip: skipContainer }, async () => {
  const res = await admin.req(`/api/hosts/${HOST}/containers/${containerId}/stats`);
  assert.equal(res.status, 200);
  const s = (await res.json()) as Record<string, unknown>;
  for (const k of ["cpuPct", "memPct", "memBytes", "netRx", "netTx"]) assert.equal(typeof s[k], "number", k);
});

async function readSse(path: string, ms = 3000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  let text = "";
  try {
    const res = await admin.req(path, { signal: ctrl.signal });
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
  } finally {
    clearTimeout(timer);
  }
  return text;
}

test("container live log stream (SSE)", { skip: skipContainer }, async () => {
  const text = await readSse(`/api/hosts/${HOST}/containers/${containerId}/logs/stream`);
  assert.match(text, /event: line\ndata: .+/);
});

test("log download (ADMIN)", { skip: skipContainer }, async () => {
  const res = await admin.req(`/api/logs/download?scope=container&hostId=${HOST}&containerId=${containerId}&tail=50&since=3600`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment/);
});

// ---------- host logs ----------

test("host logs list, snapshot and follow", { skip: skipAll }, async () => {
  const list = (await (await admin.req(`/api/hosts/${HOST}/logs`)).json()) as { logs: Array<{ name: string; exists: boolean }> };
  const readable = list.logs.find((l) => l.exists);
  if (!readable) return; // non-local host: nothing to read
  const snap = await admin.req(`/api/hosts/${HOST}/logs/${readable.name}?tail=5`);
  assert.equal(snap.status, 200);
  assert.ok((await snap.text()).split("\n").filter(Boolean).length <= 5);
  const sse = await readSse(`/api/hosts/${HOST}/logs/${readable.name}?follow=1&follow=1&tail=3`);
  assert.match(sse, /event: line/);
  assert.equal((await admin.req(`/api/hosts/${HOST}/logs/../../etc/passwd`)).status, 404);
});

// ---------- bookmarks / saved searches / audit ----------

test("bookmarks CRUD", { skip: skipAll }, async () => {
  const created = await admin.mutate("/api/bookmarks", "POST", { containerId: "it-test", timestamp: new Date().toISOString(), note: "integration" });
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: number };
  const list = (await (await admin.req("/api/bookmarks?containerId=it-test")).json()) as Array<{ id: number }>;
  assert.ok(list.some((b) => b.id === id));
  assert.equal((await admin.mutate(`/api/bookmarks/${id}`, "DELETE")).status, 200);
});

test("saved searches CRUD", { skip: skipAll }, async () => {
  const created = await admin.mutate("/api/saved-searches", "POST", { name: "it-test", query: "level:error" });
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: number };
  assert.equal((await admin.mutate(`/api/saved-searches/${id}`, "DELETE")).status, 200);
});

test("audit log is readable by ADMIN", { skip: skipAll }, async () => {
  const res = await admin.req("/api/audit?limit=5&action=auth.");
  assert.equal(res.status, 200);
  const { entries } = (await res.json()) as { entries: Array<{ action: string }> };
  assert.ok(entries.some((e) => e.action === "auth.login"));
});

// ---------- container actions (opt-in, cy-test* only) ----------

test("container lifecycle actions", { skip: skipActions }, async () => {
  const act = async (action: string) => {
    const res = await admin.mutate(`/api/hosts/${HOST}/containers/${containerId}/actions`, "POST", { action });
    return { status: res.status, body: (await res.json()) as { state?: string; noop?: boolean } };
  };
  assert.equal((await act("explode")).status, 400);
  let r = await act("pause");
  assert.equal(r.body.state, "paused");
  assert.equal((await act("pause")).status, 409);
  r = await act("unpause");
  assert.equal(r.body.state, "running");
  r = await act("stop");
  assert.equal(r.body.state, "exited");
  r = await act("stop");
  assert.equal(r.body.noop, true);
  r = await act("start");
  assert.equal(r.body.state, "running");
  r = await act("restart");
  assert.equal(r.body.state, "running");
});
