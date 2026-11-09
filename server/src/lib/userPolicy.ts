/**
 * Pure password-policy and user-mutation guard helpers.
 * Kept free of database/session imports so they can be unit-tested directly.
 */

export const PASSWORD_MIN_CHARS = 12;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; message: string };

/**
 * Validates a candidate password against ContainerYard's policy:
 * - At least 12 characters (matching ADMIN_PASSWORD policy)
 * - At most 72 UTF-8 bytes (bcrypt silently truncates beyond 72 bytes)
 * - Must differ from currentPassword when changing one's own password
 */
export function validateNewPassword(
  newPassword: unknown,
  currentPassword?: string,
): PasswordValidationResult {
  if (typeof newPassword !== "string") {
    return { valid: false, message: "Password is required" };
  }
  if (newPassword.length < PASSWORD_MIN_CHARS) {
    return {
      valid: false,
      message: `Password must be at least ${PASSWORD_MIN_CHARS} characters`,
    };
  }
  if (Buffer.byteLength(newPassword, "utf8") > PASSWORD_MAX_BYTES) {
    return {
      valid: false,
      message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
    };
  }
  if (currentPassword !== undefined && newPassword === currentPassword) {
    return {
      valid: false,
      message: "New password must differ from current password",
    };
  }
  return { valid: true };
}

export type UserRole = "ADMIN" | "VIEWER";

export interface UserMutationGuardInput {
  actorId: string;
  targetId: string;
  targetCurrentRole: UserRole;
  action: "delete" | "role_change";
  newRole?: UserRole;
  adminCount: number;
}

export type UserMutationGuardResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 409; message: string };

/**
 * Enforces self-protection (403) and last-admin protection (409) for user
 * administration mutations.
 */
export function evaluateUserMutationGuard(
  input: UserMutationGuardInput,
): UserMutationGuardResult {
  const { actorId, targetId, targetCurrentRole, action, newRole, adminCount } = input;

  if (action === "delete") {
    if (actorId === targetId) {
      return {
        allowed: false,
        status: 403,
        message: "You cannot delete your own account",
      };
    }
    if (targetCurrentRole === "ADMIN" && adminCount <= 1) {
      return {
        allowed: false,
        status: 409,
        message: "Cannot delete the last remaining administrator",
      };
    }
    return { allowed: true };
  }

  if (action === "role_change") {
    if (actorId === targetId && targetCurrentRole === "ADMIN" && newRole !== "ADMIN") {
      return {
        allowed: false,
        status: 403,
        message: "You cannot demote your own account",
      };
    }
    if (targetCurrentRole === "ADMIN" && newRole === "VIEWER" && adminCount <= 1) {
      return {
        allowed: false,
        status: 409,
        message: "Cannot demote the last remaining administrator",
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}
