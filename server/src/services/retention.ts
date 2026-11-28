/**
 * Retention for the monitoring tables. ContainerMetricsHourly is a 90-day trend
 * history (METRICS_RETENTION_DAYS, default 90). Alert history is kept until an
 * operator opts in with ALERT_HISTORY_RETENTION_DAYS (unset or 0 = keep), so an
 * upgrade never deletes alert history on its own.
 */
import { prisma } from "../db/client";

const DAY_MS = 24 * 60 * 60 * 1000;

function retentionDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function pruneMonitoring(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<{ metrics: number; alertHistory: number }> {
  const result = { metrics: 0, alertHistory: 0 };
  if (!prisma) return result;

  const metricsDays = retentionDays(env.METRICS_RETENTION_DAYS, 90);
  if (metricsDays > 0) {
    const { count } = await prisma.containerMetricsHourly.deleteMany({
      where: { aggregatedAt: { lt: new Date(now - metricsDays * DAY_MS) } },
    });
    result.metrics = count;
  }

  const historyDays = retentionDays(env.ALERT_HISTORY_RETENTION_DAYS, 0);
  if (historyDays > 0) {
    const { count } = await prisma.alertHistory.deleteMany({
      where: { createdAt: { lt: new Date(now - historyDays * DAY_MS) } },
    });
    result.alertHistory = count;
  }
  return result;
}
