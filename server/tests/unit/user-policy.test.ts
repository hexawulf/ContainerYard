import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateUserMutationGuard,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARS,
  validateNewPassword,
} from "../../src/lib/userPolicy";

test("validateNewPassword enforces 12-char minimum and non-string rejection", () => {
  assert.equal(validateNewPassword(undefined).valid, false);
  assert.equal(validateNewPassword(null).valid, false);
  assert.equal(validateNewPassword(123456789012).valid, false);
  assert.equal(validateNewPassword("").valid, false);
  assert.equal(validateNewPassword("short-pass").valid, false);
  assert.equal(validateNewPassword("a".repeat(PASSWORD_MIN_CHARS - 1)).valid, false);

  assert.deepEqual(validateNewPassword("a".repeat(PASSWORD_MIN_CHARS)), { valid: true });
  assert.deepEqual(validateNewPassword("a".repeat(PASSWORD_MAX_BYTES)), { valid: true });
});

test("validateNewPassword enforces 72-byte UTF-8 limit including multibyte characters", () => {
  // 73 ASCII bytes -> rejected
  const ascii73 = "a".repeat(PASSWORD_MAX_BYTES + 1);
  const resAscii73 = validateNewPassword(ascii73);
  assert.equal(resAscii73.valid, false);
  if (!resAscii73.valid) {
    assert.match(resAscii73.message, /72 bytes/);
  }

  // 18 4-byte emojis = 18 chars (>= 12), 72 UTF-8 bytes (<= 72) -> accepted
  const emoji18 = "🐳".repeat(18);
  assert.equal(Buffer.byteLength(emoji18, "utf8"), 72);
  assert.deepEqual(validateNewPassword(emoji18), { valid: true });

  // 19 4-byte emojis = 19 chars, 76 UTF-8 bytes (> 72) -> rejected
  const emoji19 = "🐳".repeat(19);
  assert.equal(Buffer.byteLength(emoji19, "utf8"), 76);
  const resEmoji19 = validateNewPassword(emoji19);
  assert.equal(resEmoji19.valid, false);
  if (!resEmoji19.valid) {
    assert.match(resEmoji19.message, /72 bytes/);
  }

  // 24 3-byte snowmen = 24 chars, 72 UTF-8 bytes -> accepted
  const snow24 = "☃".repeat(24);
  assert.equal(Buffer.byteLength(snow24, "utf8"), 72);
  assert.deepEqual(validateNewPassword(snow24), { valid: true });

  // 25 3-byte snowmen = 25 chars, 75 UTF-8 bytes -> rejected
  const snow25 = "☃".repeat(25);
  assert.equal(Buffer.byteLength(snow25, "utf8"), 75);
  assert.equal(validateNewPassword(snow25).valid, false);
});

test("validateNewPassword requires newPassword to differ from currentPassword when provided", () => {
  const current = "correct-horse-battery-staple";
  const same = validateNewPassword(current, current);
  assert.equal(same.valid, false);
  if (!same.valid) {
    assert.match(same.message, /differ/i);
  }

  const diff = validateNewPassword("different-horse-battery-staple", current);
  assert.deepEqual(diff, { valid: true });
});

test("evaluateUserMutationGuard blocks self-delete and self-demote with 403", () => {
  const selfDelete = evaluateUserMutationGuard({
    actorId: "admin-1",
    targetId: "admin-1",
    targetCurrentRole: "ADMIN",
    action: "delete",
    adminCount: 2,
  });
  assert.equal(selfDelete.allowed, false);
  if (!selfDelete.allowed) {
    assert.equal(selfDelete.status, 403);
    assert.match(selfDelete.message, /own account/i);
  }

  const selfDemote = evaluateUserMutationGuard({
    actorId: "admin-1",
    targetId: "admin-1",
    targetCurrentRole: "ADMIN",
    action: "role_change",
    newRole: "VIEWER",
    adminCount: 2,
  });
  assert.equal(selfDemote.allowed, false);
  if (!selfDemote.allowed) {
    assert.equal(selfDemote.status, 403);
    assert.match(selfDemote.message, /demote your own account/i);
  }

  // Keeping own ADMIN role is allowed (no-op)
  const selfKeepAdmin = evaluateUserMutationGuard({
    actorId: "admin-1",
    targetId: "admin-1",
    targetCurrentRole: "ADMIN",
    action: "role_change",
    newRole: "ADMIN",
    adminCount: 1,
  });
  assert.deepEqual(selfKeepAdmin, { allowed: true });
});

test("evaluateUserMutationGuard blocks deleting or demoting the last remaining ADMIN with 409", () => {
  const deleteLastAdmin = evaluateUserMutationGuard({
    actorId: "actor-id",
    targetId: "only-admin-id",
    targetCurrentRole: "ADMIN",
    action: "delete",
    adminCount: 1,
  });
  assert.equal(deleteLastAdmin.allowed, false);
  if (!deleteLastAdmin.allowed) {
    assert.equal(deleteLastAdmin.status, 409);
    assert.match(deleteLastAdmin.message, /last remaining administrator/i);
  }

  const demoteLastAdmin = evaluateUserMutationGuard({
    actorId: "actor-id",
    targetId: "only-admin-id",
    targetCurrentRole: "ADMIN",
    action: "role_change",
    newRole: "VIEWER",
    adminCount: 1,
  });
  assert.equal(demoteLastAdmin.allowed, false);
  if (!demoteLastAdmin.allowed) {
    assert.equal(demoteLastAdmin.status, 409);
    assert.match(demoteLastAdmin.message, /last remaining administrator/i);
  }

  // Deleting or demoting another ADMIN when adminCount >= 2 is allowed
  assert.deepEqual(
    evaluateUserMutationGuard({
      actorId: "admin-1",
      targetId: "admin-2",
      targetCurrentRole: "ADMIN",
      action: "delete",
      adminCount: 2,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    evaluateUserMutationGuard({
      actorId: "admin-1",
      targetId: "admin-2",
      targetCurrentRole: "ADMIN",
      action: "role_change",
      newRole: "VIEWER",
      adminCount: 2,
    }),
    { allowed: true },
  );

  // Deleting a VIEWER when adminCount === 1 is allowed
  assert.deepEqual(
    evaluateUserMutationGuard({
      actorId: "admin-1",
      targetId: "viewer-1",
      targetCurrentRole: "VIEWER",
      action: "delete",
      adminCount: 1,
    }),
    { allowed: true },
  );
});
