import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Role } from "@prisma/client";
import type { SessionUser } from "../models/containers";
import { prisma } from "../db/client";
import { env } from "../config/env";

const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" || process.env.VITE_AUTH_DISABLED === "true";

// Requests per client IP per 15 minutes. A logged-in dashboard polls stats and
// summaries for every host (~80 requests/minute with four hosts), so signed-in
// sessions get a higher ceiling; anonymous traffic keeps the strict one.
export const GLOBAL_LIMIT_ANONYMOUS = 1000;
export const GLOBAL_LIMIT_AUTHENTICATED = 10000;

export function globalRequestLimit(req: Request): number {
  return req.session?.user?.id ? GLOBAL_LIMIT_AUTHENTICATED : GLOBAL_LIMIT_ANONYMOUS;
}

// Must be mounted after the session middleware so req.session is populated.
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => globalRequestLimit(req as Request),
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

export const passwordChangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many password change attempts. Please try again later." },
});

async function destroyRevokedSession(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!req.session?.destroy) {
      resolve();
      return;
    }
    req.session.destroy(() => resolve());
  });
  res.clearCookie(env.COOKIE_NAME, {
    domain: env.COOKIE_DOMAIN,
    path: "/",
  });
}

async function verifySessionUser(req: Request, res: Response): Promise<boolean> {
  if (AUTH_DISABLED) {
    if (!req.session.user) {
      req.session.user = {
        id: "auth-disabled",
        email: env.ADMIN_EMAIL,
        role: "ADMIN",
        sessionVersion: 0,
      };
    }
    res.locals.user = req.session.user;
    return true;
  }

  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  if (!prisma) {
    res.status(503).json({ message: "Authentication service temporarily unavailable" });
    return false;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, role: true, sessionVersion: true },
  });

  if (!dbUser || (sessionUser.sessionVersion ?? 0) !== dbUser.sessionVersion) {
    await destroyRevokedSession(req, res);
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  // Refresh role and email from the database so demotions/updates apply immediately.
  req.session.user = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    sessionVersion: dbUser.sessionVersion,
  };
  res.locals.user = req.session.user;
  return true;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await verifySessionUser(req, res);
    if (!ok) return;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await verifySessionUser(req, res);
      if (!ok) return;

      if (!roles.includes(req.session.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function attachUserToResponse(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) {
    res.locals.user = req.session.user;
  }
  next();
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser & {
      id: string;
      role: Role;
      sessionVersion?: number;
    };
  }
}

declare module "express" {
  interface Response {
    locals: Record<string, unknown> & { user?: SessionUser };
  }
}
