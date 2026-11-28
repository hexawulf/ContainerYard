import { errorMessage } from "../lib/httpError";
import { Router } from "express";
import { prisma } from "../db/client";
import {
  insertAlertRuleSchema,
  insertNotificationChannelSchema,
} from "@shared/schema";
import { requireRole } from "../middleware/auth";
import { channelConfigForRole } from "../lib/redact";
import { sendNotification } from "../services/notifications";
import { validateWebhookUrl } from "../lib/safeWebhook";

const router = Router();
const patchChannelSchema = insertNotificationChannelSchema.partial();
const patchAlertRuleSchema = insertAlertRuleSchema.partial();

// Reading alerts is open to any signed-in user; changing them needs ADMIN.
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  return requireRole("ADMIN")(req, res, next);
});

/** Reject webhook channels whose URL points at internal/metadata addresses. */
function webhookConfigError(type: unknown, config: unknown): string | null {
  if (type !== "webhook") return null;
  try {
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    const url =
      typeof parsed === "object" && parsed !== null ? (parsed as { url?: unknown }).url : undefined;
    validateWebhookUrl(url);
    return null;
  } catch (error: unknown) {
    return errorMessage(error) || "Invalid webhook configuration";
  }
}

function parseIntParam(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2025";
}

// ==================== Notification Channels ====================

router.get("/channels", async (req, res, next) => {
  if (!prisma) return res.json([]);
  try {
    const channels = await prisma.notificationChannel.findMany({
      orderBy: { createdAt: "desc" },
    });
    const role = req.session.user?.role;
    res.json(channels.map((c) => ({ ...c, config: channelConfigForRole(c.config, role) })));
  } catch (error) {
    next(error);
  }
});

router.get("/channels/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    const channel = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    res.json({ ...channel, config: channelConfigForRole(channel.config, req.session.user?.role) });
  } catch (error) {
    next(error);
  }
});

router.post("/channels", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const result = insertNotificationChannelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid channel data",
        details: { name: "ZodError", issues: result.error.issues },
      });
    }
    const webhookError = webhookConfigError(result.data.type, result.data.config);
    if (webhookError) {
      return res.status(400).json({ error: webhookError });
    }

    const channel = await prisma.notificationChannel.create({
      data: {
        name: result.data.name,
        type: result.data.type,
        config: result.data.config,
        enabled: result.data.enabled ?? "true",
      },
    });
    res.status(201).json(channel);
  } catch (error) {
    next(error);
  }
});

router.patch("/channels/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    const parsed = patchChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid channel data",
        details: { name: "ZodError", issues: parsed.error.issues },
      });
    }

    const { name, type, config, enabled } = parsed.data;
    if (type !== undefined || config !== undefined) {
      const existing = await prisma.notificationChannel.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const webhookError = webhookConfigError(type ?? existing.type, config ?? existing.config);
      if (webhookError) {
        return res.status(400).json({ error: webhookError });
      }
    }

    const data: { name?: string; type?: string; config?: string; enabled?: string } = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (config !== undefined) data.config = config;
    if (enabled !== undefined) data.enabled = enabled;

    const channel = await prisma.notificationChannel.update({
      where: { id },
      data,
    });
    res.json(channel);
  } catch (error) {
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: "Channel not found" });
    }
    next(error);
  }
});

router.delete("/channels/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    await prisma.notificationChannel.deleteMany({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/channels/:id/test", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    const channel = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (channel.enabled !== "true") {
      return res.status(400).json({ error: "Channel is disabled" });
    }

    const testMessage = `🧪 Test notification from ContainerYard\n\nThis is a test message to verify your ${channel.type} notification channel "${channel.name}" is working correctly.\n\nTime: ${new Date().toLocaleString()}`;

    try {
      await sendNotification(channel, testMessage);
      res.json({ success: true, message: "Test notification sent successfully" });
    } catch (error: unknown) {
      res.status(500).json({
        error: "Failed to send test notification",
        details: errorMessage(error),
      });
    }
  } catch (error) {
    next(error);
  }
});

// ==================== Alert Rules ====================

router.get("/rules", async (_req, res, next) => {
  if (!prisma) return res.json([]);
  try {
    const rules = await prisma.alertRule.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(rules);
  } catch (error) {
    next(error);
  }
});

router.get("/rules/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid rule ID" });

    const rule = await prisma.alertRule.findUnique({ where: { id } });
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

router.post("/rules", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const result = insertAlertRuleSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid rule data",
        details: { name: "ZodError", issues: result.error.issues },
      });
    }

    const rule = await prisma.alertRule.create({
      data: {
        name: result.data.name,
        description: result.data.description ?? null,
        conditionType: result.data.conditionType,
        operator: result.data.operator,
        threshold: result.data.threshold,
        durationMinutes: result.data.durationMinutes ?? 0,
        containerFilter: result.data.containerFilter ?? null,
        channelId: result.data.channelId,
        enabled: result.data.enabled ?? "true",
      },
    });
    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

router.patch("/rules/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "Invalid rule ID" });
    }

    const parsed = patchAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid rule data",
        details: { name: "ZodError", issues: parsed.error.issues },
      });
    }

    const {
      name,
      description,
      conditionType,
      operator,
      threshold,
      durationMinutes,
      containerFilter,
      channelId,
      enabled,
    } = parsed.data;
    const data: {
      name?: string;
      description?: string | null;
      conditionType?: string;
      operator?: string;
      threshold?: string;
      durationMinutes?: number;
      containerFilter?: string | null;
      channelId?: number;
      enabled?: string;
    } = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (conditionType !== undefined) data.conditionType = conditionType;
    if (operator !== undefined) data.operator = operator;
    if (threshold !== undefined) data.threshold = threshold;
    if (durationMinutes !== undefined) data.durationMinutes = durationMinutes;
    if (containerFilter !== undefined) data.containerFilter = containerFilter;
    if (channelId !== undefined) data.channelId = channelId;
    if (enabled !== undefined) data.enabled = enabled;

    const rule = await prisma.alertRule.update({
      where: { id },
      data,
    });
    res.json(rule);
  } catch (error) {
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: "Rule not found" });
    }
    next(error);
  }
});

router.delete("/rules/:id", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid rule ID" });

    await prisma.alertRule.deleteMany({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ==================== Alert History ====================

router.get("/history", async (req, res, next) => {
  if (!prisma) return res.json([]);
  try {
    const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const limit = Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 1000);

    const history = await prisma.alertHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.post("/history/:id/acknowledge", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid alert ID" });

    const acknowledgedBy =
      typeof req.body?.acknowledgedBy === "string" && req.body.acknowledgedBy.trim()
        ? req.body.acknowledgedBy.trim()
        : "system";

    const alert = await prisma.alertHistory.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });
    res.json(alert);
  } catch (error) {
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: "Alert not found" });
    }
    next(error);
  }
});

router.delete("/history", async (req, res, next) => {
  if (!prisma) return res.status(503).json({ error: "Database unavailable" });
  try {
    const rawDays = req.query.days ? parseInt(String(req.query.days), 10) : 30;
    const days = Number.isNaN(rawDays) ? 30 : Math.min(Math.max(rawDays, 1), 3650);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { count } = await prisma.alertHistory.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    res.json({ success: true, deleted: count, olderThanDays: days });
  } catch (error) {
    next(error);
  }
});

export { router as alertsRouter };
