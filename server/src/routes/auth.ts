import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { z, ZodError } from "zod";
import { prisma } from "../db/client";
import { env } from "../config/env";
import { HttpError } from "../lib/httpError";
import {
  invalidateUserSessionCache,
  loginRateLimiter,
  passwordChangeRateLimiter,
  requireAuth,
} from "../middleware/auth";
import { changePasswordSchema, loginSchema } from "../types/zod";
import { validateNewPassword } from "../lib/userPolicy";
import { recordAudit } from "../services/audit";
import {
  getFirebasePublicConfig,
  verifyFirebaseLogin,
  type VerifyIdTokenFn,
} from "../services/firebaseAuth";

const BCRYPT_COST = 12;

const firebaseLoginSchema = z.object({
  idToken: z.string().min(1, "ID token is required").max(4096, "ID token too long"),
});

// A session that only exists to hold a CSRF token (anyone can request one
// without signing in) lives this long instead of the 7 days of a login.
export const ANONYMOUS_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

// Compared against when the e-mail is unknown, so that a login attempt takes
// the same time whether or not the account exists.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(24).toString("hex"), BCRYPT_COST);
  return dummyHash;
}

function handleError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid payload", issues: z.flattenError(error) });
  }
  return next(error);
}

export interface AuthRouterOptions {
  /** Optional Firebase ID token verifier (for unit tests). */
  verifyIdToken?: VerifyIdTokenFn;
  /** Optional custom login rate limiter (for unit tests). */
  rateLimiter?: typeof loginRateLimiter;
  /** Optional env source for Firebase checks (defaults to process.env). */
  getEnv?: () => NodeJS.ProcessEnv;
}

export function createAuthRouter(opts: AuthRouterOptions = {}): Router {
  const router = Router();
  const rateLimitMiddleware = opts.rateLimiter ?? loginRateLimiter;
  const getEnv = opts.getEnv ?? (() => process.env);

  router.get("/config", (_req, res) => {
    return res.json({ firebase: getFirebasePublicConfig(getEnv()) });
  });

  router.post("/login", rateLimitMiddleware, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      if (!prisma) {
        return res.status(503).json({ message: "Authentication service temporarily unavailable" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user =
        (await prisma.user.findUnique({ where: { email: normalizedEmail } })) ??
        (normalizedEmail !== email ? await prisma.user.findUnique({ where: { email } }) : null);
      const passwordMatch = await bcrypt.compare(password, user ? user.password : await getDummyHash());
      if (!user || !passwordMatch) {
        await recordAudit(req, { action: "auth.login", outcome: "failure", target: email.slice(0, 254) });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
        authMethod: "password",
      };
      req.session.csrfToken = randomBytes(24).toString("hex");

      const publicUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        authMethod: "password" as const,
      };

      await recordAudit(req, { action: "auth.login", outcome: "success", target: user.email });
      return res.json({ user: publicUser });
    } catch (error) {
      handleError(error, req, res, next);
    }
  });

  router.post("/firebase-login", rateLimitMiddleware, async (req, res, next) => {
    try {
      const parsed = firebaseLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        await recordAudit(req, {
          action: "auth.login",
          outcome: "failure",
          detail: "google: invalid_payload",
        });
        return res.status(400).json({ message: "Invalid payload", issues: z.flattenError(parsed.error) });
      }

      let verified: { email: string; uid: string; name?: string };
      try {
        verified = await verifyFirebaseLogin(parsed.data.idToken, getEnv(), opts.verifyIdToken);
      } catch (err) {
        if (err instanceof HttpError) {
          const reasonCode = err.code ?? `http_${err.status}`;
          await recordAudit(req, {
            action: "auth.login",
            outcome: "failure",
            detail: `google: ${reasonCode}`,
          });
          return res.status(err.status).json({ message: err.message });
        }
        throw err;
      }

      if (!prisma) {
        await recordAudit(req, {
          action: "auth.login",
          outcome: "failure",
          target: verified.email,
          detail: "google: db_unavailable",
        });
        return res.status(503).json({ message: "Authentication service temporarily unavailable" });
      }

      const user = await prisma.user.findUnique({ where: { email: verified.email } });
      if (!user) {
        await recordAudit(req, {
          action: "auth.login",
          outcome: "failure",
          target: verified.email,
          detail: "google: no_user_row",
        });
        return res.status(403).json({
          message: "This Google account has no ContainerYard user. Ask an administrator to create one.",
        });
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
        authMethod: "google",
      };
      req.session.csrfToken = randomBytes(24).toString("hex");

      const publicUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        authMethod: "google" as const,
      };

      await recordAudit(req, {
        action: "auth.login",
        outcome: "success",
        target: user.email,
        detail: "google",
      });
      return res.json({ user: publicUser });
    } catch (error) {
      handleError(error, req, res, next);
    }
  });

  router.all("/firebase-login", (_req, res) => {
    res.set("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  });

  router.post(
    "/change-password",
    passwordChangeRateLimiter,
    requireAuth,
    async (req, res, next) => {
      try {
        const targetEmail = req.session.user?.email ?? "unknown";
        const previousAuthMethod = req.session.user?.authMethod ?? "password";
        const parsed = changePasswordSchema.safeParse(req.body);
        if (!parsed.success) {
          await recordAudit(req, {
            action: "auth.password_change",
            outcome: "failure",
            target: targetEmail,
            detail: "invalid payload",
          });
          return res.status(400).json({
            message: "Current password and new password are required",
            issues: z.flattenError(parsed.error),
          });
        }

        const { currentPassword, newPassword } = parsed.data;

        // Validate length and 72-byte bcrypt limit first
        const formatCheck = validateNewPassword(newPassword);
        if (!formatCheck.valid) {
          await recordAudit(req, {
            action: "auth.password_change",
            outcome: "failure",
            target: targetEmail,
            detail: formatCheck.message,
          });
          return res.status(400).json({ message: formatCheck.message });
        }

        if (!prisma) {
          return res.status(503).json({ message: "Authentication service temporarily unavailable" });
        }

        const user = await prisma.user.findUnique({
          where: { id: req.session.user!.id },
        });

        if (!user) {
          return res.status(401).json({ message: "Authentication required" });
        }

        const currentMatches = await bcrypt.compare(currentPassword, user.password);
        if (!currentMatches) {
          await recordAudit(req, {
            action: "auth.password_change",
            outcome: "failure",
            target: user.email,
            detail: "incorrect current password",
          });
          return res.status(401).json({ message: "Current password is incorrect" });
        }

        const diffCheck = validateNewPassword(newPassword, currentPassword);
        if (!diffCheck.valid) {
          await recordAudit(req, {
            action: "auth.password_change",
            outcome: "failure",
            target: user.email,
            detail: diffCheck.message,
          });
          return res.status(400).json({ message: diffCheck.message });
        }

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            sessionVersion: { increment: 1 },
          },
          select: {
            id: true,
            email: true,
            role: true,
            sessionVersion: true,
          },
        });
        invalidateUserSessionCache(updated.id);

        const previousCsrfToken = req.session?.csrfToken;
        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        req.session.user = {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          sessionVersion: updated.sessionVersion,
          authMethod: previousAuthMethod,
        };
        req.session.csrfToken = previousCsrfToken ?? randomBytes(24).toString("hex");

        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        await recordAudit(req, {
          action: "auth.password_change",
          outcome: "success",
          target: updated.email,
        });

        return res.status(200).json({
          success: true,
          user: {
            id: updated.id,
            email: updated.email,
            role: updated.role,
            authMethod: previousAuthMethod,
          },
        });
      } catch (error) {
        handleError(error, req, res, next);
      }
    },
  );

  router.post("/logout", requireAuth, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }

      res.clearCookie(env.COOKIE_NAME, {
        domain: env.COOKIE_DOMAIN,
        path: "/",
      });

      return res.status(200).json({ success: true });
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    const user = req.session.user!;
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        authMethod: user.authMethod ?? "password",
      },
    });
  });

  router.get("/csrf", (req, res, next) => {
    try {
      // Ensure session exists and has CSRF token
      if (!req.session.csrfToken) {
        req.session.csrfToken = randomBytes(24).toString("hex");
      }
      if (!req.session.user) {
        // Not signed in: keep the stored session short-lived. Login regenerates
        // the session, which gets the normal lifetime again.
        req.session.cookie.maxAge = ANONYMOUS_SESSION_MAX_AGE_MS;
      }

      return res.json({ csrfToken: req.session.csrfToken });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export const authRouter = createAuthRouter();
