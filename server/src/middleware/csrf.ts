/**
 * CSRF protection (synchronizer token).
 *
 * GET /api/auth/csrf stores a random token in the server-side session and
 * returns it; the client sends it back in the `x-csrf-token` header on every
 * mutating request (client/src/lib/queryClient.ts). This middleware enforces
 * that. Enforcement had been removed in 42ec512 along with csurf, which left
 * every POST/PATCH/DELETE route open to cross-site requests.
 */
import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function tokensMatch(expected: unknown, provided: unknown): boolean {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  if (!expected || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = (req.session as any)?.csrfToken;
  const header = req.headers["x-csrf-token"];
  const provided = Array.isArray(header) ? header[0] : header;

  if (!tokensMatch(expected, provided)) {
    return res.status(403).json({ error: "Invalid CSRF token", code: "EBADCSRFTOKEN" });
  }
  return next();
}
