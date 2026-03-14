import { Router } from "express";
import { db } from "../../db";
import { eq, and, gte, desc } from "drizzle-orm";
import { containerMetricsHourly } from "@shared/schema";
import { isSQLite, logSQLiteDisabled } from "../config/databaseCapabilities";

const router = Router();

function safeParseInt(value: string | undefined, fallback: number, max = 10000): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, 1), max);
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Helper to return empty data for SQLite mode
function emptyMetricsResponse(res: any, format: string = 'json') {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="metrics-empty-${Date.now()}.csv"`);
    res.send('Container ID,Container Name,Timestamp,Avg CPU %,Max CPU %,Avg Memory %,Max Memory %,Avg Memory (Bytes),Max Memory (Bytes),Network Rx,Network Tx,Block Read,Block Write,Sample Count\n');
    return;
  }
  res.json([]);
}

// Get historical metrics for a specific container
router.get("/:hostId/containers/:containerId/metrics/history", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Container metrics history");
    return emptyMetricsResponse(res);
  }
  
  try {
    const { hostId, containerId } = req.params;
    const days = safeParseInt(req.query.days as string, 7, 365);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          eq(containerMetricsHourly.containerId, containerId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      )
      .orderBy(containerMetricsHourly.aggregatedAt);

    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Get aggregated metrics summary for all containers
router.get("/:hostId/metrics/summary", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Metrics summary");
    return emptyMetricsResponse(res);
  }
  
  try {
    const { hostId } = req.params;
    const days = safeParseInt(req.query.days as string, 7, 365);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      )
      .orderBy(desc(containerMetricsHourly.aggregatedAt));

    const containerStats = new Map<string, any>();
    
    for (const metric of metrics) {
      if (!containerStats.has(metric.containerId)) {
        containerStats.set(metric.containerId, {
          containerId: metric.containerId,
          containerName: metric.containerName,
          avgCpu: [],
          maxCpu: [],
          avgMemory: [],
          maxMemory: [],
          dataPoints: 0,
        });
      }
      
      const stats = containerStats.get(metric.containerId)!;
      stats.avgCpu.push(parseFloat(metric.avgCpuPercent) || 0);
      stats.maxCpu.push(parseFloat(metric.maxCpuPercent) || 0);
      stats.avgMemory.push(parseFloat(metric.avgMemoryPercent) || 0);
      stats.maxMemory.push(parseFloat(metric.maxMemoryPercent) || 0);
      stats.dataPoints++;
    }

    const summary = Array.from(containerStats.values()).map((stats: any) => ({
      containerId: stats.containerId,
      containerName: stats.containerName,
      avgCpuPercent: (stats.avgCpu.reduce((a: number, b: number) => a + b, 0) / stats.avgCpu.length).toFixed(2),
      maxCpuPercent: Math.max(...stats.maxCpu).toFixed(2),
      avgMemoryPercent: (stats.avgMemory.reduce((a: number, b: number) => a + b, 0) / stats.avgMemory.length).toFixed(2),
      maxMemoryPercent: Math.max(...stats.maxMemory).toFixed(2),
      dataPoints: stats.dataPoints,
    }));

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Get top CPU consumers
router.get("/:hostId/metrics/top-cpu", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Top CPU consumers");
    return emptyMetricsResponse(res);
  }
  
  try {
    const { hostId } = req.params;
    const limit = safeParseInt(req.query.limit as string, 5, 100);
    const days = safeParseInt(req.query.days as string, 7, 365);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      );

    const containerCpu = new Map<string, { name: string; avgCpu: number[] }>();
    
    for (const metric of metrics) {
      if (!containerCpu.has(metric.containerId)) {
        containerCpu.set(metric.containerId, {
          name: metric.containerName,
          avgCpu: [],
        });
      }
      containerCpu.get(metric.containerId)!.avgCpu.push(parseFloat(metric.avgCpuPercent) || 0);
    }

    const topConsumers = Array.from(containerCpu.entries())
      .map(([id, data]) => ({
        containerId: id,
        containerName: data.name,
        avgCpuPercent: (data.avgCpu.reduce((a, b) => a + b, 0) / data.avgCpu.length).toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.avgCpuPercent) - parseFloat(a.avgCpuPercent))
      .slice(0, limit);

    res.json(topConsumers);
  } catch (error) {
    next(error);
  }
});

// Get top memory consumers
router.get("/:hostId/metrics/top-memory", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Top memory consumers");
    return emptyMetricsResponse(res);
  }
  
  try {
    const { hostId } = req.params;
    const limit = safeParseInt(req.query.limit as string, 5, 100);
    const days = safeParseInt(req.query.days as string, 7, 365);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      );

    const containerMemory = new Map<string, { name: string; avgMemory: number[] }>();
    
    for (const metric of metrics) {
      if (!containerMemory.has(metric.containerId)) {
        containerMemory.set(metric.containerId, {
          name: metric.containerName,
          avgMemory: [],
        });
      }
      containerMemory.get(metric.containerId)!.avgMemory.push(parseFloat(metric.avgMemoryPercent) || 0);
    }

    const topConsumers = Array.from(containerMemory.entries())
      .map(([id, data]) => ({
        containerId: id,
        containerName: data.name,
        avgMemoryPercent: (data.avgMemory.reduce((a, b) => a + b, 0) / data.avgMemory.length).toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.avgMemoryPercent) - parseFloat(a.avgMemoryPercent))
      .slice(0, limit);

    res.json(topConsumers);
  } catch (error) {
    next(error);
  }
});

// Export metrics as CSV
router.get("/:hostId/metrics/export/csv", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Metrics CSV export");
    return emptyMetricsResponse(res, 'csv');
  }
  
  try {
    const { hostId } = req.params;
    const days = safeParseInt(req.query.days as string, 7, 365);
    const format = req.query.format || 'csv';
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      )
      .orderBy(containerMetricsHourly.aggregatedAt);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="metrics-${hostId}-${Date.now()}.json"`);
      res.json(metrics);
      return;
    }

    const csvHeader = [
      'Container ID',
      'Container Name',
      'Timestamp',
      'Avg CPU %',
      'Max CPU %',
      'Avg Memory %',
      'Max Memory %',
      'Avg Memory (Bytes)',
      'Max Memory (Bytes)',
      'Network Rx',
      'Network Tx',
      'Block Read',
      'Block Write',
      'Sample Count'
    ].join(',');

    const csvRows = metrics.map((metric: any) => [
      escapeCsvField(metric.containerId),
      escapeCsvField(metric.containerName),
      escapeCsvField(metric.aggregatedAt.toISOString()),
      metric.avgCpuPercent,
      metric.maxCpuPercent,
      metric.avgMemoryPercent,
      metric.maxMemoryPercent,
      metric.avgMemoryBytes,
      metric.maxMemoryBytes,
      metric.totalNetworkRx,
      metric.totalNetworkTx,
      metric.totalBlockRead,
      metric.totalBlockWrite,
      metric.sampleCount
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="metrics-${hostId}-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

// Export container-specific metrics as CSV
router.get("/:hostId/containers/:containerId/metrics/export/csv", async (req, res, next) => {
  if (isSQLite) {
    logSQLiteDisabled("Container metrics CSV export");
    return emptyMetricsResponse(res, 'csv');
  }
  
  try {
    const { hostId, containerId } = req.params;
    const days = safeParseInt(req.query.days as string, 7, 365);
    const format = req.query.format || 'csv';
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metrics = await db
      .select()
      .from(containerMetricsHourly)
      .where(
        and(
          eq(containerMetricsHourly.hostId, hostId),
          eq(containerMetricsHourly.containerId, containerId),
          gte(containerMetricsHourly.aggregatedAt, cutoffDate)
        )
      )
      .orderBy(containerMetricsHourly.aggregatedAt);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="container-metrics-${containerId}-${Date.now()}.json"`);
      res.json(metrics);
      return;
    }

    const csvHeader = [
      'Timestamp',
      'Avg CPU %',
      'Max CPU %',
      'Avg Memory %',
      'Max Memory %',
      'Avg Memory (Bytes)',
      'Max Memory (Bytes)',
      'Network Rx',
      'Network Tx',
      'Block Read',
      'Block Write',
      'Sample Count'
    ].join(',');

    const csvRows = metrics.map((metric: any) => [
      escapeCsvField(metric.aggregatedAt.toISOString()),
      metric.avgCpuPercent,
      metric.maxCpuPercent,
      metric.avgMemoryPercent,
      metric.maxMemoryPercent,
      metric.avgMemoryBytes,
      metric.maxMemoryBytes,
      metric.totalNetworkRx,
      metric.totalNetworkTx,
      metric.totalBlockRead,
      metric.totalBlockWrite,
      metric.sampleCount
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="container-metrics-${containerId}-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

export { router as metricsRouter };
