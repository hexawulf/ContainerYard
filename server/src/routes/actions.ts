/**
 * Per-container lifecycle actions.
 *
 *   POST /api/hosts/:hostId/containers/:containerId/actions   { "action": "stop" }
 *
 * ADMIN only, CSRF-protected (global middleware), rate-limited, and every
 * attempt (allowed, denied or failed) is written to the audit log.
 * Only DOCKER-provider hosts support actions; cAdvisor-only hosts are read-only.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { containerActionSchema } from "@shared/schema";
import { getHost } from "../config/hosts";
import { performAction } from "../services/docker";
import { recordAudit } from "../services/audit";

const router = Router();

// Docker container IDs are hex; names are [a-zA-Z0-9][a-zA-Z0-9_.-]+.
const CONTAINER_REF = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export const actionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many container actions. Please wait a minute." },
});

/** ADMIN check that also audits denied attempts. */
function requireAdminAudited(req: Request, res: Response, next: NextFunction) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: "Authentication required" });
  if (user.role !== "ADMIN") {
    void recordAudit(req, {
      action: `container.${String(req.body?.action ?? "unknown")}`,
      outcome: "denied",
      hostId: req.params.hostId,
      target: req.params.containerId,
      detail: `role ${user.role} is not allowed to run container actions`,
    });
    return res.status(403).json({ error: "Container actions require the ADMIN role" });
  }
  return next();
}

router.post(
  "/:hostId/containers/:containerId/actions",
  actionRateLimiter,
  requireAdminAudited,
  async (req, res, next) => {
    const { hostId, containerId } = req.params;
    const parsed = containerActionSchema.safeParse(req.body?.action);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid action",
        allowed: containerActionSchema.options,
      });
    }
    const action = parsed.data;

    if (!CONTAINER_REF.test(containerId)) {
      return res.status(400).json({ error: "Invalid container id" });
    }

    let host;
    try {
      host = getHost(hostId);
    } catch (error) {
      return next(error);
    }
    if (host.provider !== "DOCKER") {
      return res.status(501).json({ error: `Host ${hostId} is read-only (provider ${host.provider})` });
    }

    try {
      const result = await performAction(host, containerId, action);
      await recordAudit(req, {
        action: `container.${action}`,
        outcome: "success",
        hostId,
        target: result.name ?? containerId,
        detail: result.noop ? `no-op: container already ${result.state}` : `state: ${result.state ?? "removed"}`,
      });
      return res.json({ success: true, action, ...result });
    } catch (error: any) {
      await recordAudit(req, {
        action: `container.${action}`,
        outcome: "failure",
        hostId,
        target: containerId,
        detail: error?.message,
      });
      const status = error?.status ?? 500;
      return res.status(status).json({ error: error?.message ?? `Failed to ${action} container` });
    }
  },
);

export { router as actionsRouter };
