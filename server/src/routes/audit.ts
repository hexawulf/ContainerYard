/**
 *   GET /api/audit?limit=100&before=<id>&action=container.
 * ADMIN only. Newest first; page with `before` = last id of the previous page.
 */
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { listAudit } from "../services/audit";

const router = Router();

router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const limit = Number.parseInt(String(req.query.limit ?? "100"), 10);
    const before = Number.parseInt(String(req.query.before ?? ""), 10);
    const action = typeof req.query.action === "string" ? req.query.action.slice(0, 64) : undefined;
    const entries = await listAudit({
      limit: Number.isNaN(limit) ? 100 : limit,
      before: Number.isNaN(before) ? undefined : before,
      action,
    });
    res.json({ entries, nextBefore: entries.length ? entries[entries.length - 1].id : null });
  } catch (error) {
    next(error);
  }
});

export { router as auditRouter };
