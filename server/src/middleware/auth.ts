import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Role } from "@prisma/client";
import type { SessionUser } from "../models/containers";

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many login attempts. Please try again later.",
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) {
    return next();
  }

  return res.status(401).json({ message: "Authentication required" });
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
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
    };
  }
}

declare module "express" {
  interface Response {
    locals: Record<string, unknown> & { user?: SessionUser };
  }
}
