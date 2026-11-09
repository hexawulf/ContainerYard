/**
 * User administration routes (ADMIN only).
 *
 *   GET    /api/users                    list users (no password hashes or totpSecret)
 *   POST   /api/users                    create user { email, role, password } -> 201 (409 duplicate)
 *   PATCH  /api/users/:id                update role { role } -> 200 (bumps sessionVersion on change)
 *   POST   /api/users/:id/reset-password reset password { newPassword } -> 200 (bumps sessionVersion)
 *   DELETE /api/users/:id                delete user + bookmarks + saved searches in $transaction -> 200
 */
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db/client";
import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserRoleSchema,
} from "../types/zod";
import {
  evaluateUserMutationGuard,
  validateNewPassword,
} from "../lib/userPolicy";
import { recordAudit } from "../services/audit";

const router = Router();
const BCRYPT_COST = 12;

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

router.use((_req, res, next) => {
  if (!prisma) {
    return res.status(503).json({ message: "Database unavailable" });
  }
  return next();
});

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma!.user.findMany({
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const rawTarget = typeof req.body?.email === "string" ? req.body.email.trim().slice(0, 254) : "unknown";
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Invalid user payload";
      await recordAudit(req, {
        action: "user.create",
        outcome: "failure",
        target: rawTarget,
        detail: firstIssue,
      });
      return res.status(400).json({
        message: firstIssue,
        issues: parsed.error.flatten(),
      });
    }

    const { email, role, password } = parsed.data;
    const passwordCheck = validateNewPassword(password);
    if (!passwordCheck.valid) {
      await recordAudit(req, {
        action: "user.create",
        outcome: "failure",
        target: email,
        detail: passwordCheck.message,
      });
      return res.status(400).json({ message: passwordCheck.message });
    }

    const existing = await prisma!.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await recordAudit(req, {
        action: "user.create",
        outcome: "failure",
        target: email,
        detail: "duplicate email",
      });
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
    const created = await prisma!.user.create({
      data: {
        email,
        role,
        password: hashedPassword,
      },
      select: USER_PUBLIC_SELECT,
    });

    await recordAudit(req, {
      action: "user.create",
      outcome: "success",
      target: created.email,
      detail: `role=${created.role}`,
    });

    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === "P2002") {
      const target = typeof req.body?.email === "string" ? req.body.email.trim().slice(0, 254) : "unknown";
      await recordAudit(req, {
        action: "user.create",
        outcome: "failure",
        target,
        detail: "duplicate email",
      });
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await prisma!.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const parsed = updateUserRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Invalid role payload";
      await recordAudit(req, {
        action: "user.role_change",
        outcome: "failure",
        target: target.email,
        detail: firstIssue,
      });
      return res.status(400).json({
        message: firstIssue,
        issues: parsed.error.flatten(),
      });
    }

    const newRole = parsed.data.role;
    const adminCount = await prisma!.user.count({ where: { role: "ADMIN" } });
    const guard = evaluateUserMutationGuard({
      actorId: req.session.user!.id,
      targetId: target.id,
      targetCurrentRole: target.role,
      action: "role_change",
      newRole,
      adminCount,
    });

    if (!guard.allowed) {
      await recordAudit(req, {
        action: "user.role_change",
        outcome: "denied",
        target: target.email,
        detail: guard.message,
      });
      return res.status(guard.status).json({ message: guard.message });
    }

    const roleChanged = target.role !== newRole;
    const updated = roleChanged
      ? await prisma!.user.update({
          where: { id: target.id },
          data: {
            role: newRole,
            sessionVersion: { increment: 1 },
          },
          select: USER_PUBLIC_SELECT,
        })
      : target;

    await recordAudit(req, {
      action: "user.role_change",
      outcome: "success",
      target: updated.email,
      detail: `${target.role} -> ${updated.role}`,
    });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/reset-password", async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await prisma!.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const parsed = resetUserPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      await recordAudit(req, {
        action: "user.password_reset",
        outcome: "failure",
        target: target.email,
        detail: "invalid payload",
      });
      return res.status(400).json({
        message: "New password is required",
        issues: parsed.error.flatten(),
      });
    }

    const passwordCheck = validateNewPassword(parsed.data.newPassword);
    if (!passwordCheck.valid) {
      await recordAudit(req, {
        action: "user.password_reset",
        outcome: "failure",
        target: target.email,
        detail: passwordCheck.message,
      });
      return res.status(400).json({ message: passwordCheck.message });
    }

    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST);
    const updated = await prisma!.user.update({
      where: { id: target.id },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
      select: { id: true, sessionVersion: true },
    });

    if (req.session.user?.id === updated.id) {
      req.session.user.sessionVersion = updated.sessionVersion;
    }

    await recordAudit(req, {
      action: "user.password_reset",
      outcome: "success",
      target: target.email,
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await prisma!.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const adminCount = await prisma!.user.count({ where: { role: "ADMIN" } });
    const guard = evaluateUserMutationGuard({
      actorId: req.session.user!.id,
      targetId: target.id,
      targetCurrentRole: target.role,
      action: "delete",
      adminCount,
    });

    if (!guard.allowed) {
      await recordAudit(req, {
        action: "user.delete",
        outcome: "denied",
        target: target.email,
        detail: guard.message,
      });
      return res.status(guard.status).json({ message: guard.message });
    }

    await prisma!.$transaction([
      prisma!.logBookmark.deleteMany({ where: { userId: target.id } }),
      prisma!.savedSearch.deleteMany({ where: { userId: target.id } }),
      prisma!.user.delete({ where: { id: target.id } }),
    ]);

    await recordAudit(req, {
      action: "user.delete",
      outcome: "success",
      target: target.email,
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export { router as usersRouter };
