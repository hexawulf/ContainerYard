import { Router } from "express";
import { log } from "../../vite";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import {
  alertRules,
  notificationChannels,
  alertHistory,
  insertAlertRuleSchema,
  insertNotificationChannelSchema,
} from "@shared/schema";
import { isSQLite, logSQLiteDisabled, requirePostgreSQLAsync } from "../config/databaseCapabilities";
import { requireRole } from "../middleware/auth";
import { sendNotification } from "../services/notifications";
import { validateWebhookUrl } from "../lib/safeWebhook";

const router = Router();

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
    validateWebhookUrl((parsed as any)?.url);
    return null;
  } catch (error: any) {
    return error?.message ?? "Invalid webhook configuration";
  }
}

function parseIntParam(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

// Error response helper for SQLite mode
function sqliteErrorResponse(action: string) {
  return {
    error: "Feature unavailable",
    message: `${action} requires PostgreSQL. SQLite is currently configured.`,
    sqliteMode: true,
  };
}

// ==================== Notification Channels ====================

router.get("/channels", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Notification channels list");
    return res.json([]);
  }
  
  try {
    const channels = await db
      .select()
      .from(notificationChannels)
      .orderBy(desc(notificationChannels.createdAt));
    res.json(channels);
  } catch (error) {
    next(error);
  }
});

router.get("/channels/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Notification channel retrieval"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id));
    
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    
    res.json(channel);
  } catch (error) {
    next(error);
  }
});

router.post("/channels", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Notification channel creation"));
  }
  
  try {
    const result = insertNotificationChannelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid channel data",
        details: { name: "ZodError", issues: result.error.issues }
      });
    }
    const webhookError = webhookConfigError(result.data.type, result.data.config);
    if (webhookError) {
      return res.status(400).json({ error: webhookError });
    }

    const [channel] = await db
      .insert(notificationChannels)
      .values(result.data)
      .returning();
    
    res.status(201).json(channel);
  } catch (error) {
    next(error);
  }
});

router.patch("/channels/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Notification channel update"));
  }
  
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    const { name, type, config, enabled } = req.body;
    if (type !== undefined || config !== undefined) {
      const [existing] = await db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const webhookError = webhookConfigError(type ?? existing.type, config ?? existing.config);
      if (webhookError) {
        return res.status(400).json({ error: webhookError });
      }
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name);
    if (type !== undefined) updates.type = String(type);
    if (config !== undefined) updates.config = String(config);
    if (enabled !== undefined) updates.enabled = String(enabled);

    const [channel] = await db
      .update(notificationChannels)
      .set(updates)
      .where(eq(notificationChannels.id, id))
      .returning();
    
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    
    res.json(channel);
  } catch (error) {
    next(error);
  }
});

router.delete("/channels/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Notification channel deletion"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    await db
      .delete(notificationChannels)
      .where(eq(notificationChannels.id, id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/channels/:id/test", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Notification testing"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid channel ID" });

    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id));
    
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
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to send test notification", 
        details: error.message 
      });
    }
  } catch (error) {
    next(error);
  }
});

// ==================== Alert Rules ====================

router.get("/rules", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Alert rules list");
    return res.json([]);
  }
  
  try {
    const rules = await db
      .select()
      .from(alertRules)
      .orderBy(desc(alertRules.createdAt));
    res.json(rules);
  } catch (error) {
    next(error);
  }
});

router.get("/rules/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert rule retrieval"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid rule ID" });

    const [rule] = await db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id));
    
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

router.post("/rules", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert rule creation"));
  }
  
  try {
    const result = insertAlertRuleSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid rule data", 
        details: { name: "ZodError", issues: result.error.issues } 
      });
    }

    const [rule] = await db
      .insert(alertRules)
      .values(result.data)
      .returning();
    
    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

router.patch("/rules/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert rule update"));
  }
  
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid rule ID" });
    }

    const { name, description, conditionType, operator, threshold, durationMinutes, containerFilter, channelId, enabled } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name);
    if (description !== undefined) updates.description = String(description);
    if (conditionType !== undefined) updates.conditionType = String(conditionType);
    if (operator !== undefined) updates.operator = String(operator);
    if (threshold !== undefined) updates.threshold = String(threshold);
    if (durationMinutes !== undefined) updates.durationMinutes = Number(durationMinutes);
    if (containerFilter !== undefined) updates.containerFilter = String(containerFilter);
    if (channelId !== undefined) updates.channelId = Number(channelId);
    if (enabled !== undefined) updates.enabled = String(enabled);

    const [rule] = await db
      .update(alertRules)
      .set(updates)
      .where(eq(alertRules.id, id))
      .returning();
    
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

router.delete("/rules/:id", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert rule deletion"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid rule ID" });

    await db
      .delete(alertRules)
      .where(eq(alertRules.id, id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ==================== Alert History ====================

router.get("/history", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Alert history");
    return res.json([]);
  }
  
  try {
    const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const limit = Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 1000);
    
    const history = await db
      .select()
      .from(alertHistory)
      .orderBy(desc(alertHistory.createdAt))
      .limit(limit);
    
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.post("/history/:id/acknowledge", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert acknowledgment"));
  }
  
  try {
    const id = parseIntParam(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid alert ID" });

    const { acknowledgedBy } = req.body;
    
    const [alert] = await db
      .update(alertHistory)
      .set({ 
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedBy || "system"
      })
      .where(eq(alertHistory.id, id))
      .returning();
    
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

router.delete("/history", async (req, res, next) => {
  if (isSQLite) {
    return res.status(503).json(sqliteErrorResponse("Alert history cleanup"));
  }
  
  try {
    const days = req.query.days ? parseInt(String(req.query.days)) : 30;
    
    res.json({ success: true, message: `Would delete alerts older than ${days} days` });
  } catch (error) {
    next(error);
  }
});

export { router as alertsRouter };
