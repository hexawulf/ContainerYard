import type { Request } from "express";
import { prisma } from "../db/client";
import { isAuthDisabled } from "./authDisabled";
import { getFirebaseAllowedEmails, isFirebaseEnabled } from "../services/firebaseAuth";

export const MAX_SSE_STREAMS_PER_USER = 6;

const activeStreamsByUser = new Map<string, number>();

/**
 * Reserves an SSE stream slot for the given user key.
 * Returns a release callback when under the per-user limit, or null when the limit is reached.
 */
export function acquireSseStreamSlot(
  userKey: string,
  maxStreams = MAX_SSE_STREAMS_PER_USER
): (() => void) | null {
  const current = activeStreamsByUser.get(userKey) ?? 0;
  if (current >= maxStreams) {
    return null;
  }
  activeStreamsByUser.set(userKey, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (activeStreamsByUser.get(userKey) ?? 1) - 1;
    if (next <= 0) {
      activeStreamsByUser.delete(userKey);
    } else {
      activeStreamsByUser.set(userKey, next);
    }
  };
}

export function getActiveSseStreamCount(userKey: string): number {
  return activeStreamsByUser.get(userKey) ?? 0;
}

export function resetSseStreamCountsForTests(): void {
  activeStreamsByUser.clear();
}

/**
 * True while the request's session still exists in the session store. Logout
 * destroys it there, and the store expires it at maxAge, but a long-lived SSE
 * request keeps its own copy of req.session, so the store must be asked.
 */
export function sessionStillStored(req: Request): Promise<boolean> {
  const store = req.sessionStore;
  const sid = req.sessionID;
  if (!store || !sid) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      store.get(sid, (err, data) => resolve(!err && Boolean(data)));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Verifies during long-lived SSE heartbeats that the session user still exists,
 * has the same sessionVersion, and retains required role privileges.
 */
export async function isSseSessionValid(
  req: Request,
  options?: { requireRole?: "ADMIN" | "VIEWER" }
): Promise<boolean> {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) return false;
  if (sessionUser.id === "auth-disabled") return isAuthDisabled();
  if (!prisma) return false;
  try {
    // The in-memory req.session outlives logout and expiry; the store does not.
    if (!(await sessionStillStored(req))) return false;
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { email: true, role: true, sessionVersion: true },
    });
    if (!dbUser) return false;
    const expectedVersion = sessionUser.sessionVersion ?? 0;
    if (dbUser.sessionVersion !== expectedVersion) return false;
    if (options?.requireRole === "ADMIN" && dbUser.role !== "ADMIN") return false;
    if (sessionUser.authMethod === "google") {
      if (!isFirebaseEnabled() || !getFirebaseAllowedEmails().includes(dbUser.email.toLowerCase())) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
