/**
 * Log Moment bookmarks, per user, stored with Prisma (SQLite or PostgreSQL).
 *
 * The client component (client/src/components/LogBookmarks.tsx) has called
 * these endpoints since Oct 2025, but no server route ever existed, so every
 * call hit the /api/* 404 handler.
 *
 *   GET    /api/bookmarks[?containerId=...]
 *   POST   /api/bookmarks        { containerId, timestamp, note?, filters? }
 *   DELETE /api/bookmarks/:id
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";

const router = Router();

const createSchema = z.object({
  containerId: z.string().min(1).max(512),
  timestamp: z.string().min(1).max(64),
  note: z.string().max(2000).nullish(),
  filters: z.string().max(4000).nullish(),
});

router.use((_req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  return next();
});

router.get("/", async (req, res, next) => {
  try {
    const containerId = typeof req.query.containerId === "string" ? req.query.containerId : undefined;
    const bookmarks = await prisma!.logBookmark.findMany({
      where: { userId: req.session.user!.id, ...(containerId ? { containerId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json(bookmarks);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid bookmark", issues: z.flattenError(parsed.error) });
    }
    const bookmark = await prisma!.logBookmark.create({
      data: {
        userId: req.session.user!.id,
        containerId: parsed.data.containerId,
        timestamp: parsed.data.timestamp,
        note: parsed.data.note ?? null,
        filters: parsed.data.filters ?? null,
      },
    });
    res.status(201).json(bookmark);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: "Invalid bookmark id" });
    // Scope the delete to the owner so users cannot remove each other's bookmarks.
    const { count } = await prisma!.logBookmark.deleteMany({
      where: { id, userId: req.session.user!.id },
    });
    if (count === 0) return res.status(404).json({ error: "Bookmark not found" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export { router as bookmarksRouter };
