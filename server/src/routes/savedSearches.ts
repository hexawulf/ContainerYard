/**
 * Per-user saved log searches, stored with Prisma (SQLite or PostgreSQL).
 * Like /api/bookmarks, the client (components/SavedSearches.tsx) called these
 * routes long before the server implemented them.
 *
 *   GET    /api/saved-searches
 *   POST   /api/saved-searches   { name, query, description? }
 *   DELETE /api/saved-searches/:id
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  query: z.string().min(1).max(4000),
  description: z.string().max(2000).nullish(),
});

router.use((_req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  return next();
});

router.get("/", async (req, res, next) => {
  try {
    res.json(
      await prisma!.savedSearch.findMany({
        where: { userId: req.session.user!.id },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid saved search", issues: z.flattenError(parsed.error) });
    }
    const saved = await prisma!.savedSearch.create({
      data: {
        userId: req.session.user!.id,
        name: parsed.data.name,
        query: parsed.data.query,
        description: parsed.data.description ?? null,
      },
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: "Invalid id" });
    const { count } = await prisma!.savedSearch.deleteMany({ where: { id, userId: req.session.user!.id } });
    if (count === 0) return res.status(404).json({ error: "Saved search not found" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export { router as savedSearchesRouter };
