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
// Loads the express-session Request augmentation (req.session) on its own,
// so this file type-checks without importing middleware/auth.
import type {} from "express-session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same parsing as config/env.ts `allowedOrigins`, read lazily so this module
 * stays importable without the full env schema (unit tests).
 */
function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function tokensMatch(expected: unknown, provided: unknown): boolean {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  if (!expected || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function isAllowedOrigin(
  origin: unknown,
  hostHeader: unknown,
  allowed: readonly string[] = configuredOrigins(),
): boolean {
  if (typeof origin !== "string" || !origin) return true;
  if (allowed.includes(origin)) return true;
  if (typeof hostHeader === "string" && hostHeader) {
    if (origin === `https://${hostHeader}` || origin === `http://${hostHeader}`) {
      return true;
    }
  }
  return false;
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: "Forbidden origin", code: "EBADORIGIN" });
  }

  const expected = req.session?.csrfToken;
  const header = req.headers["x-csrf-token"];
  const provided = Array.isArray(header) ? header[0] : header;

  if (!tokensMatch(expected, provided)) {
    return res.status(403).json({ error: "Invalid CSRF token", code: "EBADCSRFTOKEN" });
  }
  return next();
}
