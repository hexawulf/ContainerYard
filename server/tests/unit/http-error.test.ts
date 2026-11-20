import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError, errorInfo, errorMessage } from "../../src/lib/httpError";

test("HttpError carries status and only the options that were given", () => {
  const e = new HttpError("gone", 404);
  assert.ok(e instanceof Error);
  assert.equal(e.message, "gone");
  assert.equal(e.status, 404);
  assert.deepEqual(Object.keys(e).sort(), ["status"]);

  const full = new HttpError("slow", 504, { code: "CADVISOR_TIMEOUT", hostId: "nas", originalError: "x", expose: true });
  assert.deepEqual(
    { code: full.code, hostId: full.hostId, originalError: full.originalError, expose: full.expose },
    { code: "CADVISOR_TIMEOUT", hostId: "nas", originalError: "x", expose: true },
  );
});

test("errorInfo reads a docker-modem style error", () => {
  const err = Object.assign(new Error("(HTTP code 409) unexpected - conflict"), {
    statusCode: 409,
    reason: "container is not running",
    json: { message: "Container abc is not running" },
  });
  assert.deepEqual(errorInfo(err), {
    message: "(HTTP code 409) unexpected - conflict",
    name: "Error",
    status: undefined,
    statusCode: 409,
    code: undefined,
    reason: "container is not running",
    jsonMessage: "Container abc is not running",
    expose: undefined,
  });
});

test("errorInfo reads Node errno and Prisma codes", () => {
  assert.equal(errorInfo(Object.assign(new Error("connect EACCES"), { code: "EACCES" })).code, "EACCES");
  assert.equal(errorInfo({ code: "P2002", message: "Unique constraint" }).code, "P2002");
});

test("errorInfo ignores fields of the wrong type instead of trusting them", () => {
  const info = errorInfo({ message: 42, status: "404", statusCode: Number.NaN, code: 7, json: "x", expose: "yes" });
  assert.deepEqual(info, {
    message: "",
    name: undefined,
    status: undefined,
    statusCode: undefined,
    code: undefined,
    reason: undefined,
    jsonMessage: undefined,
    expose: undefined,
  });
});

test("thrown primitives: text stays, nullish becomes empty so fallbacks apply", () => {
  assert.equal(errorMessage("boom"), "boom");
  assert.equal(errorMessage(404), "404");
  assert.equal(errorMessage(undefined), "");
  assert.equal(errorMessage(null), "");
  assert.equal(errorMessage({}) || "fallback", "fallback");
});
