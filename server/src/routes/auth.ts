import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcrypt";
import { ZodError } from "zod";
import { prisma } from "../db/client";
import { env, isProduction } from "../config/env";
import { loginRateLimiter, requireAuth } from "../middleware/auth";
import { loginSchema } from "../types/zod";

const router = Router();

function handleError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid payload", issues: error.flatten() });
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
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
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
    };

    return res.json({ user: req.session.user });
  } catch (error) {
    handleError(error, req, res, next);
  }
});

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

router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  return res.json({ user: req.session.user });
});

router.get("/csrf", (req, res) => {
  const token = req.csrfToken();
  res.cookie(`${env.COOKIE_NAME}.csrf`, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    domain: env.COOKIE_DOMAIN,
    path: "/",
    maxAge: 60 * 60 * 1000,
  });
  return res.json({ token });
});

export { router as authRouter };
