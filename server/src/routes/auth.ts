import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { z, ZodError } from "zod";
import { prisma } from "../db/client";
import { env } from "../config/env";
import { loginRateLimiter, passwordChangeRateLimiter, requireAuth } from "../middleware/auth";
import { changePasswordSchema, loginSchema } from "../types/zod";
import { validateNewPassword } from "../lib/userPolicy";
import { recordAudit } from "../services/audit";

const router = Router();
const BCRYPT_COST = 12;

function handleError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid payload", issues: z.flattenError(error) });
  }
  return next(error);
}

router.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    if (!prisma) {
      return res.status(503).json({ message: "Authentication service temporarily unavailable" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatch = user ? await bcrypt.compare(password, user.password) : false;
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
    };

    const publicUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    await recordAudit(req, { action: "auth.login", outcome: "success", target: user.email });
    return res.json({ user: publicUser });
  } catch (error) {
    handleError(error, req, res, next);
  }
});

router.post(
  "/change-password",
  passwordChangeRateLimiter,
  requireAuth,
  async (req, res, next) => {
    try {
      const targetEmail = req.session.user?.email ?? "unknown";
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

      const previousCsrfToken = (req.session as any)?.csrfToken;
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
      };
      (req.session as any).csrfToken = previousCsrfToken ?? randomBytes(24).toString("hex");

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
    },
  });
});

router.get("/csrf", (req, res, next) => {
  try {
    // Ensure session exists and has CSRF token
    if (!(req.session as any).csrfToken) {
      (req.session as any).csrfToken = randomBytes(24).toString("hex");
    }

    return res.json({ csrfToken: (req.session as any).csrfToken });
  } catch (error) {
    return next(error);
  }
});

export { router as authRouter };
