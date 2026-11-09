import { ApiError } from "@/lib/api";

export const PASSWORD_MIN_CHARS = 12;
export const PASSWORD_MAX_BYTES = 72;

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validateClientPassword(
  newPassword: string,
  options?: { currentPassword?: string; confirmPassword?: string },
): string | null {
  if (newPassword.length < PASSWORD_MIN_CHARS) {
    return `Password must be at least ${PASSWORD_MIN_CHARS} characters.`;
  }
  if (getUtf8ByteLength(newPassword) > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
  }
  if (
    options?.currentPassword !== undefined &&
    options.currentPassword.length > 0 &&
    newPassword === options.currentPassword
  ) {
    return "New password must differ from current password.";
  }
  if (
    options?.confirmPassword !== undefined &&
    newPassword !== options.confirmPassword
  ) {
    return "New password and confirmation do not match.";
  }
  return null;
}

export function generateRandomPassword(length = 16): string {
  const charset =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";
  const bytes = new Uint32Array(length);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * charset.length);
    }
  }
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.body) {
      try {
        const parsed = JSON.parse(err.body) as { message?: string; error?: string };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          return parsed.message;
        }
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          return parsed.error;
        }
      } catch {
        // Ignore JSON parse error and fall back
      }
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
