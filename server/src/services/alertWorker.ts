import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  alertRules,
  notificationChannels,
  alertHistory,
  type AlertRule,
  type NotificationChannel,
} from "@shared/schema";
import { listContainers as listDockerContainers, getContainerStats as getDockerContainerStats } from "./docker";
import { getCadvisorService } from "./cadvisor";
import { getHost, listHosts } from "../config/hosts";
import type { ContainerSummary, ContainerStats } from "../models/containers";

interface AlertEvaluation {
  rule: AlertRule;
  container: ContainerSummary;
  triggered: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
}

// Store recent metrics to calculate durations
const metricsHistory = new Map<string, { stats: ContainerStats[]; timestamps: number[] }>();

class AlertWorkerService {
  private interval: NodeJS.Timeout | null = null;
  private checkIntervalMs = 30000; // 30 seconds

  async start() {
    if (this.interval) {
      console.log("Alert worker already running");
      return;
    }

    console.log("Starting alert worker service...");
    this.interval = setInterval(() => {
      this.checkAlerts().catch((error) => {
        console.error("Error checking alerts:", error);
      });
    }, this.checkIntervalMs);

    // Run initial check
    await this.checkAlerts();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("Alert worker stopped");
    }
  }

  private async checkAlerts() {
    try {
      // Get all enabled alert rules
      const rules = await db
        .select()
        .from(alertRules)
        .where(eq(alertRules.enabled, "true"));

      if (rules.length === 0) {
        return;
      }

      // Get all containers from all hosts
      const hostSummaries = listHosts();
      const allContainers: ContainerSummary[] = [];
      
      for (const hostSummary of hostSummaries) {
        try {
          const host = getHost(hostSummary.id);
          let containers: ContainerSummary[] = [];
          if (host.provider === "DOCKER") {
            containers = await listDockerContainers(host);
          } else {
            const service = getCadvisorService(host);
            containers = await service.listContainers(host);
          }
          allContainers.push(...containers);
        } catch (error) {
          console.error(`Error fetching containers from host ${hostSummary.id}:`, error);
        }
      }

      // Evaluate each rule against each container
      const evaluations: AlertEvaluation[] = [];
      for (const rule of rules) {
        const containersToCheck = this.filterContainersByRule(allContainers, rule);
        
        for (const container of containersToCheck) {
          try {
            const evaluation = await this.evaluateRule(rule, container);
            if (evaluation.triggered) {
              evaluations.push(evaluation);
            }
          } catch (error) {
            console.error(`Error evaluating rule ${rule.id} for container ${container.id}:`, error);
          }
        }
      }

      // Process triggered alerts
      for (const evaluation of evaluations) {
        await this.handleTriggeredAlert(evaluation);
      }
    } catch (error) {
      console.error("Error in checkAlerts:", error);
    }
  }

  private filterContainersByRule(containers: ContainerSummary[], rule: AlertRule): ContainerSummary[] {
    if (!rule.containerFilter) {
      return containers;
    }

    try {
      const filter = JSON.parse(rule.containerFilter);
      return containers.filter((container) => {
        if (filter.names && !filter.names.includes(container.name)) {
          return false;
        }
        if (filter.images && !filter.images.some((img: string) => container.image.includes(img))) {
          return false;
        }
        if (filter.labels) {
          for (const [key, value] of Object.entries(filter.labels)) {
            if (container.labels[key] !== value) {
              return false;
            }
          }
        }
        return true;
      });
    } catch {
      return containers;
    }
  }

  private async evaluateRule(rule: AlertRule, container: ContainerSummary): Promise<AlertEvaluation> {
    const defaultEval: AlertEvaluation = {
      rule,
      container,
      triggered: false,
      message: "",
      severity: "warning",
    };

    try {
      // Get current stats
      const host = getHost(container.hostId);
      let stats: ContainerStats | null = null;
      
      if (host.provider === "DOCKER") {
        stats = await getDockerContainerStats(host, container.id);
      } else {
        const service = getCadvisorService(host);
        stats = await service.getStats(host, container.id);
      }

      if (!stats) {
        return defaultEval;
      }

      // Store metrics history
      const historyKey = `${container.hostId}:${container.id}`;
      if (!metricsHistory.has(historyKey)) {
        metricsHistory.set(historyKey, { stats: [], timestamps: [] });
      }
      const history = metricsHistory.get(historyKey)!;
      history.stats.push(stats);
      history.timestamps.push(Date.now());
      
      // Keep only last 10 minutes of data
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      while (history.timestamps.length > 0 && history.timestamps[0] < tenMinutesAgo) {
        history.timestamps.shift();
        history.stats.shift();
      }

      // Evaluate condition
      const threshold = parseFloat(rule.threshold);
      let currentValue: number | null = null;
      let triggered = false;

      switch (rule.conditionType) {
        case "cpu_percent":
          currentValue = stats.cpuPercent;
          triggered = this.compareValues(currentValue, rule.operator, threshold);
          break;

        case "memory_percent":
          currentValue = stats.memoryPercent;
          triggered = this.compareValues(currentValue, rule.operator, threshold);
          break;

        case "container_status":
          triggered = this.compareValues(container.state, rule.operator, rule.threshold);
          break;

        default:
          return defaultEval;
      }

      // Check duration requirement
      if (triggered && rule.durationMinutes > 0) {
        const durationMs = rule.durationMinutes * 60 * 1000;
        const relevantHistory = history.stats.filter((_, index) => {
          return Date.now() - history.timestamps[index] <= durationMs;
        });

        // All values in the duration must meet the condition
        triggered = relevantHistory.length > 0 && relevantHistory.every((s) => {
          switch (rule.conditionType) {
            case "cpu_percent":
              return this.compareValues(s.cpuPercent, rule.operator, threshold);
            case "memory_percent":
              return this.compareValues(s.memoryPercent, rule.operator, threshold);
            default:
              return true;
          }
        });
      }

      if (triggered) {
        const message = this.buildAlertMessage(rule, container, currentValue);
        return {
          rule,
          container,
          triggered: true,
          message,
          severity: this.determineSeverity(rule, currentValue),
        };
      }

      return defaultEval;
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
      return defaultEval;
    }
  }

  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case ">":
        return actual > expected;
      case "<":
        return actual < expected;
      case ">=":
        return actual >= expected;
      case "<=":
        return actual <= expected;
      case "==":
        return actual == expected;
      case "!=":
        return actual != expected;
      case "contains":
        return String(actual).includes(String(expected));
      default:
        return false;
    }
  }

  private buildAlertMessage(rule: AlertRule, container: ContainerSummary, value: any): string {
    return `Alert: ${rule.name} - Container ${container.name} ${rule.conditionType} is ${value} (threshold: ${rule.operator} ${rule.threshold})`;
  }

  private determineSeverity(rule: AlertRule, value: any): "info" | "warning" | "critical" {
    // Simple severity determination - can be enhanced
    if (rule.conditionType === "cpu_percent" || rule.conditionType === "memory_percent") {
      if (value >= 90) return "critical";
      if (value >= 75) return "warning";
      return "info";
    }
    return "warning";
  }

  private async handleTriggeredAlert(evaluation: AlertEvaluation) {
    try {
      // Check if we've already sent this alert recently (debouncing)
      const recentAlerts = await db
        .select()
        .from(alertHistory)
        .where(eq(alertHistory.ruleId, evaluation.rule.id))
        .limit(1);

      if (recentAlerts.length > 0) {
        const lastAlert = recentAlerts[0];
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (new Date(lastAlert.createdAt) > fiveMinutesAgo) {
          // Skip if we sent an alert for this rule in the last 5 minutes
          return;
        }
      }

      // Create alert history entry
      await db.insert(alertHistory).values({
        ruleId: evaluation.rule.id as any,
        containerId: evaluation.container.id,
        containerName: evaluation.container.name,
        message: evaluation.message,
        severity: evaluation.severity,
      });

      // Send notification
      await this.sendNotification(evaluation);
    } catch (error) {
      console.error("Error handling triggered alert:", error);
    }
  }

  private async sendNotification(evaluation: AlertEvaluation) {
    try {
      const [channel] = await db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.id, evaluation.rule.channelId));

      if (!channel || channel.enabled !== "true") {
        return;
      }

      // TODO: Implement actual notification sending based on channel type
      console.log(`[ALERT] ${evaluation.message} (Channel: ${channel.name})`);
      
      // For webhook channels, we would do:
      // const config = JSON.parse(channel.config);
      // await fetch(config.url, { method: 'POST', body: JSON.stringify(evaluation) });
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }
}

// Singleton instance
export const alertWorker = new AlertWorkerService();
