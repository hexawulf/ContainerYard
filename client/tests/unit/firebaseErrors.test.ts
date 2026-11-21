import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../src/lib/api";
import { mapFirebaseLoginError } from "../../src/lib/firebaseErrors";

describe("mapFirebaseLoginError", () => {
  test("returns null when popup is closed or cancelled by user", () => {
    assert.equal(mapFirebaseLoginError({ code: "auth/popup-closed-by-user" }), null);
    assert.equal(mapFirebaseLoginError({ code: "auth/cancelled-popup-request" }), null);
  });

  test("maps auth/popup-blocked to helpful guidance", () => {
    assert.equal(
      mapFirebaseLoginError({ code: "auth/popup-blocked" }),
      "Allow pop-ups for containeryard.org",
    );
  });

  test("shows server message on 403 API error", () => {
    const err = new ApiError(
      403,
      JSON.stringify({ message: "This Google account has no ContainerYard user. Ask an administrator to create one." }),
    );
    assert.equal(
      mapFirebaseLoginError(err),
      "This Google account has no ContainerYard user. Ask an administrator to create one.",
    );
  });

  test("maps network and 502/503 errors to generic message", () => {
    assert.match(mapFirebaseLoginError(new ApiError("network", "")) ?? "", /unable to reach/i);
    assert.match(mapFirebaseLoginError(new ApiError(503, "")) ?? "", /unable to reach/i);
    assert.match(mapFirebaseLoginError({ code: "auth/network-request-failed" }) ?? "", /network error/i);
  });
});
