import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The env schema parses process.env at import time, so it is exercised in a child process.
// Required keys are discovered from the schema itself (no host-specific names in this test).
const ENV_MODULE = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/config/env.ts"),
).href;

function loadEnv(vars: Record<string, string>) {
  const base: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(ENV_MODULE)}); console.log("ENV_OK");`],
    { env: { ...base, ...vars }, encoding: "utf8", timeout: 30_000 },
  );
}

function requiredKeys(): string[] {
  const r = loadEnv({});
  assert.notEqual(r.status, 0, "an empty environment must fail validation");
  const keys: string[] = [];
  const re = /"path":\s*\[\s*"([A-Z0-9_]+)"/g;
  const out = r.stderr + r.stdout;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) !== null) if (keys.indexOf(m[1]) === -1) keys.push(m[1]);
  assert.ok(keys.length >= 3, `expected required keys in the error output, got: ${keys.join(",")}`);
  return keys;
}

function dummy(key: string): string {
  if (key === "REDIS_URL") return "redis://:dummy-redis-pass@redis:6379/0";
  if (key.endsWith("_URL")) return "http://cadvisor.example.internal:8080";
  if (key.includes("EMAIL")) return "admin@example.com";
  if (key.includes("ORIGINS")) return "https://example.com,http://127.0.0.1:5008";
  if (key.includes("SECRET") || key.includes("PASSWORD")) return "x".repeat(40);
  return "dummy";
}

test("env schema accepts a complete valid environment (zod 4)", () => {
  const vars = Object.fromEntries(requiredKeys().map((k) => [k, dummy(k)]));
  const r = loadEnv(vars);
  assert.equal(r.status, 0, `valid env rejected:\n${r.stderr}`);
  assert.match(r.stdout, /ENV_OK/);
});

test("env schema rejects bad values, names the field, and never echoes the value", () => {
  const keys = requiredKeys();
  const vars = Object.fromEntries(keys.map((k) => [k, dummy(k)]));
  const marker = "SENSITIVE-MARKER-9f2c";
  const emailKey = keys.find((k) => k.includes("EMAIL"));
  const urlKey = keys.find((k) => k.endsWith("_URL"));
  assert.ok(emailKey && urlKey, "schema should require an email and a URL");
  vars[emailKey] = `not-an-email-${marker}`;
  vars[urlKey] = `::not a url ${marker}`;
  const r = loadEnv(vars);
  const out = r.stderr + r.stdout;
  assert.notEqual(r.status, 0, "invalid env must stop the process");
  assert.ok(out.includes(emailKey), `error should name ${emailKey}`);
  assert.ok(out.includes(urlKey), `error should name ${urlKey}`);
  assert.ok(!out.includes(marker), "error output must not contain the rejected values");
});
