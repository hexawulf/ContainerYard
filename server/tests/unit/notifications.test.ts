import "./_testEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { sendNotification } from "../../src/services/notifications";

interface Hit {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

let server: http.Server;
let base: string;
const hits: Hit[] = [];

before(async () => {
  // The receiver below is on loopback, so allow private targets for this file only.
  process.env.WEBHOOK_ALLOW_PRIVATE = "true";
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      if (req.url === "/fail") res.writeHead(500).end();
      else if (req.url === "/moved") res.writeHead(302, { Location: "http://169.254.169.254/" }).end();
      else res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  await new Promise<void>((r) => server.close(() => r()));
});

function channel(type: string, config: unknown) {
  return { id: 7, type, config: typeof config === "string" ? config : JSON.stringify(config) };
}

test("webhook: posts text + message + timestamp, merges payload, sends custom headers", async () => {
  await sendNotification(
    channel("webhook", { url: `${base}/hook`, payload: { channel: "#ops" }, headers: { "X-Token": "t1", "X-Num": 5 } }),
    "CPU high on web",
  );
  const hit = hits.at(-1)!;
  assert.equal(hit.path, "/hook");
  assert.equal(hit.body.text, "CPU high on web");
  assert.equal(hit.body.message, "CPU high on web");
  assert.equal(hit.body.channel, "#ops");
  assert.ok(!Number.isNaN(Date.parse(String(hit.body.timestamp))));
  assert.equal(hit.headers["x-token"], "t1");
  assert.equal(hit.headers["x-num"], "5");
});

test("webhook: a non-2xx answer is an error", async () => {
  await assert.rejects(sendNotification(channel("webhook", { url: `${base}/fail` }), "m"), /status 500/);
});

test("webhook: redirects are reported and not followed", async () => {
  const before = hits.length;
  await assert.rejects(sendNotification(channel("webhook", { url: `${base}/moved` }), "m"), /redirect 302/);
  assert.equal(hits.length, before + 1);
});

test("webhook: cloud metadata addresses stay blocked even with WEBHOOK_ALLOW_PRIVATE", async () => {
  await assert.rejects(
    sendNotification(channel("webhook", { url: "http://169.254.169.254/latest/meta-data/" }), "m"),
    (e: unknown) => e instanceof Error && e.name === "WebhookBlockedError",
  );
});

test("webhook: a missing url is rejected", async () => {
  await assert.rejects(sendNotification(channel("webhook", {}), "m"));
});

test("email and browser channels only log (delivery not implemented)", async () => {
  await sendNotification(channel("email", { to: "ops@example.invalid" }), "m");
  await sendNotification(channel("browser", {}), "m");
});

test("broken JSON config and unknown types are clear errors", async () => {
  await assert.rejects(sendNotification(channel("webhook", "{nope"), "m"), /Invalid JSON .* channel 7/);
  await assert.rejects(sendNotification(channel("sms", {}), "m"), /Unsupported notification type: sms/);
});
