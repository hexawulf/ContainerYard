import { z } from "zod";

// Container State & Health
export const containerStateSchema = z.enum(['running', 'exited', 'restarting', 'paused']);
export const healthStatusSchema = z.enum(['healthy', 'unhealthy', 'starting', 'none']);
export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'fatal']);
export const protocolSchema = z.enum(['tcp', 'udp']);

// Port Mapping
export const portMappingSchema = z.object({
  container: z.number().int().min(0).max(65535),
  host: z.number().int().min(0).max(65535),
  protocol: protocolSchema,
});

export type PortMapping = z.infer<typeof portMappingSchema>;

// Volume Mount
export const volumeMountSchema = z.object({
  source: z.string(),
  destination: z.string(),
  mode: z.string(),
});

export type VolumeMount = z.infer<typeof volumeMountSchema>;

// Container Summary
export const containerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: containerStateSchema,
  health: healthStatusSchema.optional(),
  startedAt: z.string().optional(),
  cpuPct: z.number().optional(),
  memPct: z.number().optional(),
  netRx: z.number().optional(),
  netTx: z.number().optional(),
  ports: z.array(portMappingSchema),
  envCount: z.number().optional(),
});

export type ContainerSummary = z.infer<typeof containerSummarySchema>;

// Container Detail
export const containerDetailSchema = containerSummarySchema.extend({
  created: z.string(),
  command: z.string(),
  mounts: z.array(volumeMountSchema),
  networks: z.array(z.string()),
  labels: z.record(z.string(), z.string()),
});

export type ContainerDetail = z.infer<typeof containerDetailSchema>;

// Log Line
export const logLineSchema = z.object({
  ts: z.string(),
  raw: z.string(),
  level: logLevelSchema.optional(),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type LogLine = z.infer<typeof logLineSchema>;

// Environment Variable
export const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type EnvVar = z.infer<typeof envVarSchema>;

// Stats Data Point
export const statsDataPointSchema = z.object({
  ts: z.string(),
  cpuPct: z.number(),
  memPct: z.number(),
  netRx: z.number(),
  netTx: z.number(),
});

export type StatsDataPoint = z.infer<typeof statsDataPointSchema>;

// Container Action
export const containerActionSchema = z.enum(['start', 'stop', 'restart', 'pause', 'unpause', 'remove']);
export type ContainerAction = z.infer<typeof containerActionSchema>;

// Theme
export const themeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof themeSchema>;

// ==================== Prisma-backed Domain Schemas ====================

// Saved Searches
export const insertSavedSearchSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  query: z.string().min(1),
});
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export interface SavedSearch {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  query: string;
  createdAt: Date;
}

// Log Bookmarks
export const insertLogBookmarkSchema = z.object({
  containerId: z.string().min(1).max(255),
  timestamp: z.string().min(1).max(255),
  note: z.string().nullable().optional(),
  filters: z.string().nullable().optional(),
});
export type InsertLogBookmark = z.infer<typeof insertLogBookmarkSchema>;
export interface LogBookmark {
  id: number;
  userId: string;
  containerId: string;
  timestamp: string;
  note: string | null;
  filters: string | null;
  createdAt: Date;
}

// Notification Channels
export const insertNotificationChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(50),
  config: z.string().min(1),
  enabled: z.string().max(10).default("true").optional(),
});
export type InsertNotificationChannel = z.infer<typeof insertNotificationChannelSchema>;
export interface NotificationChannel {
  id: number;
  name: string;
  type: string;
  config: string;
  enabled: string;
  createdAt: Date;
  updatedAt: Date;
}

// Alert Rules
export const insertAlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  conditionType: z.string().min(1).max(50),
  operator: z.string().min(1).max(10),
  threshold: z.string().min(1).max(255),
  durationMinutes: z.number().int().min(0).default(0).optional(),
  containerFilter: z.string().nullable().optional(),
  channelId: z.number().int(),
  enabled: z.string().max(10).default("true").optional(),
});
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export interface AlertRule {
  id: number;
  name: string;
  description: string | null;
  conditionType: string;
  operator: string;
  threshold: string;
  durationMinutes: number;
  containerFilter: string | null;
  channelId: number;
  enabled: string;
  createdAt: Date;
  updatedAt: Date;
}

// Alert History
export interface AlertHistory {
  id: number;
  ruleId: number;
  containerId: string;
  containerName: string;
  message: string;
  severity: string;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  createdAt: Date;
}

// Container Metrics Hourly
export interface ContainerMetricsHourly {
  id: number;
  hostId: string;
  containerId: string;
  containerName: string;
  aggregatedAt: Date;
  avgCpuPercent: string;
  maxCpuPercent: string;
  avgMemoryPercent: string;
  maxMemoryPercent: string;
  avgMemoryBytes: string;
  maxMemoryBytes: string;
  totalNetworkRx: string;
  totalNetworkTx: string;
  totalBlockRead: string;
  totalBlockWrite: string;
  sampleCount: number;
  createdAt: Date;
}

// Container Restarts
export interface ContainerRestart {
  id: number;
  hostId: string;
  containerId: string;
  containerName: string;
  restartReason: string | null;
  createdAt: Date;
}
