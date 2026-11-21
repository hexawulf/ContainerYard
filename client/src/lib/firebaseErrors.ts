/**
 * Maps Firebase popup errors and /api/auth/firebase-login API errors to
 * user-facing messages. Returns `null` when the user simply closed/cancelled
 * the popup so no error banner/toast is shown.
 */
import { ApiError } from "./api";

function extractFirebaseCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function extractApiMessage(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // non-JSON body
  }
  return undefined;
}

export function mapFirebaseLoginError(err: unknown): string | null {
  const code = extractFirebaseCode(err);
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return null;
  }
  if (code === "auth/popup-blocked") {
    return "Allow pop-ups for containeryard.org";
  }
  if (code === "auth/network-request-failed") {
    return "Network error while contacting Google. Please check your connection and try again.";
  }

  if (err instanceof ApiError) {
    if (err.status === 403) {
      return extractApiMessage(err.body) ?? "This Google account is not authorized.";
    }
    if (err.status === 401) {
      return extractApiMessage(err.body) ?? "Invalid or expired Google sign-in token. Please try again.";
    }
    if (err.status === 429) {
      return extractApiMessage(err.body) ?? "Too many login attempts. Please try again later.";
    }
    if (err.status === "network" || err.status === 502 || err.status === 503) {
      return "Unable to reach ContainerYard right now. Please try again shortly.";
    }
    return extractApiMessage(err.body) ?? "Google sign-in failed. Please try again.";
  }

  if (err instanceof Error && err.message) {
    if (/popup-closed-by-user|cancelled-popup-request/i.test(err.message)) {
      return null;
    }
    if (/popup-blocked/i.test(err.message)) {
      return "Allow pop-ups for containeryard.org";
    }
  }

  return "Google sign-in failed. Please try again.";
}
