import { Router } from "express";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import {
  alertRules,
  notificationChannels,
  alertHistory,
  insertAlertRuleSchema,
  insertNotificationChannelSchema,
  insertAlertHistorySchema,
} from "@shared/schema";

const router = Router();

// ==================== Notification Channels ====================

// Get all notification channels
router.get("/channels", async (req, res, next) => {
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

// Get a specific notification channel
router.get("/channels/:id", async (req, res, next) => {
  try {
    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, parseInt(req.params.id)));
    
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    
    res.json(channel);
  } catch (error) {
    next(error);
  }
});

// Create a new notification channel
router.post("/channels", async (req, res, next) => {
  try {
    const result = insertNotificationChannelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid channel data", 
        details: result.error 
      });
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

// Update a notification channel
router.patch("/channels/:id", async (req, res, next) => {
  try {
    const [channel] = await db
      .update(notificationChannels)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(notificationChannels.id, parseInt(req.params.id)))
      .returning();
    
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    
    res.json(channel);
  } catch (error) {
    next(error);
  }
});

// Delete a notification channel
router.delete("/channels/:id", async (req, res, next) => {
  try {
    await db
      .delete(notificationChannels)
      .where(eq(notificationChannels.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Test a notification channel
router.post("/channels/:id/test", async (req, res, next) => {
  try {
    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, parseInt(req.params.id)));
    
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    // TODO: Implement actual notification sending
    // For now, just return success
    res.json({ success: true, message: "Test notification sent" });
  } catch (error) {
    next(error);
  }
});

// ==================== Alert Rules ====================

// Get all alert rules
router.get("/rules", async (req, res, next) => {
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

// Get a specific alert rule
router.get("/rules/:id", async (req, res, next) => {
  try {
    const [rule] = await db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, parseInt(req.params.id)));
    
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

// Create a new alert rule
router.post("/rules", async (req, res, next) => {
  try {
    const result = insertAlertRuleSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Invalid rule data", 
        details: result.error 
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

// Update an alert rule
router.patch("/rules/:id", async (req, res, next) => {
  try {
    const [rule] = await db
      .update(alertRules)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(alertRules.id, parseInt(req.params.id)))
      .returning();
    
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

// Delete an alert rule
router.delete("/rules/:id", async (req, res, next) => {
  try {
    await db
      .delete(alertRules)
      .where(eq(alertRules.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ==================== Alert History ====================

// Get alert history
router.get("/history", async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100;
    const acknowledged = req.query.acknowledged;
    
    let query = db.select().from(alertHistory);
    
    // Note: Filtering by acknowledged status requires more complex where clause
    // For now, we'll return all and let the frontend filter
    // TODO: Implement proper IS NULL / IS NOT NULL filtering with Drizzle
    
    const history = await query
      .orderBy(desc(alertHistory.createdAt))
      .limit(limit);
    
    res.json(history);
  } catch (error) {
    next(error);
  }
});

// Acknowledge an alert
router.post("/history/:id/acknowledge", async (req, res, next) => {
  try {
    const { acknowledgedBy } = req.body;
    
    const [alert] = await db
      .update(alertHistory)
      .set({ 
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedBy || "system"
      })
      .where(eq(alertHistory.id, parseInt(req.params.id)))
      .returning();
    
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

// Clear old alert history
router.delete("/history", async (req, res, next) => {
  try {
    const days = req.query.days ? parseInt(String(req.query.days)) : 30;
    
    // TODO: Implement proper date-based deletion with Drizzle
    // For now, just return success
    res.json({ success: true, message: `Would delete alerts older than ${days} days` });
  } catch (error) {
    next(error);
  }
});

export { router as alertsRouter };
