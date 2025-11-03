import { z } from "zod";
import { pgTable, varchar, text, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Container State & Health
export const containerStateSchema = z.enum(['running', 'exited', 'restarting', 'paused']);
export const healthStatusSchema = z.enum(['healthy', 'unhealthy', 'starting', 'none']);
export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'fatal']);
export const protocolSchema = z.enum(['tcp', 'udp']);

// Port Mapping
export const portMappingSchema = z.object({
  container: z.number(),
  host: z.number(),
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
  labels: z.record(z.string()),
});

export type ContainerDetail = z.infer<typeof containerDetailSchema>;

// Log Line
export const logLineSchema = z.object({
  ts: z.string(),
  raw: z.string(),
  level: logLevelSchema.optional(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
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
export const containerActionSchema = z.enum(['start', 'stop', 'restart', 'remove']);
export type ContainerAction = z.infer<typeof containerActionSchema>;

// WebSocket Message Types
export const execMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('exec:start'), containerId: z.string(), cmd: z.array(z.string()).optional() }),
  z.object({ type: z.literal('exec:data'), sessionId: z.string(), data: z.string() }),
  z.object({ type: z.literal('exec:resize'), sessionId: z.string(), cols: z.number(), rows: z.number() }),
  z.object({ type: z.literal('exec:close'), sessionId: z.string() }),
  z.object({ type: z.literal('exec:error'), sessionId: z.string(), error: z.string() }),
]);

export type ExecMessage = z.infer<typeof execMessageSchema>;

export const actionMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('action:request'), containerId: z.string(), action: containerActionSchema }),
  z.object({ type: z.literal('action:success'), containerId: z.string(), action: z.string() }),
  z.object({ type: z.literal('action:error'), containerId: z.string(), action: z.string(), error: z.string() }),
]);

export type ActionMessage = z.infer<typeof actionMessageSchema>;

export const statusMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('container:update'), container: containerSummarySchema }),
  z.object({ type: z.literal('container:removed'), containerId: z.string() }),
]);

export type StatusMessage = z.infer<typeof statusMessageSchema>;

// Saved Search Snippet
export const searchSnippetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  query: z.string(),
  createdAt: z.string(),
});

export type SearchSnippet = z.infer<typeof searchSnippetSchema>;

// Provider Type
export const providerTypeSchema = z.enum(['MOCK', 'SIMULATION', 'REMOTE']);
export type ProviderType = z.infer<typeof providerTypeSchema>;

// Theme
export const themeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof themeSchema>;

// Keyboard Shortcut
export interface KeyboardShortcut {
  key: string;
  description: string;
  category: 'navigation' | 'logs' | 'actions' | 'general';
  action: () => void;
}

// Database Tables

// Saved Searches Table
export const savedSearches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSavedSearchSchema = createInsertSchema(savedSearches).omit({ id: true, createdAt: true });
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearches.$inferSelect;

// Log Bookmarks Table  
export const logBookmarks = pgTable("log_bookmarks", {
  id: serial("id").primaryKey(),
  containerId: varchar("container_id", { length: 255 }).notNull(),
  timestamp: varchar("timestamp", { length: 255 }).notNull(),
  note: text("note"),
  filters: text("filters"), // JSON string of applied filters
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLogBookmarkSchema = createInsertSchema(logBookmarks).omit({ id: true, createdAt: true });
export type InsertLogBookmark = z.infer<typeof insertLogBookmarkSchema>;
export type LogBookmark = typeof logBookmarks.$inferSelect;

// Alert Rule Condition Types
export const alertConditionTypeSchema = z.enum([
  'cpu_percent',
  'memory_percent',
  'restart_count',
  'container_status',
  'log_pattern'
]);
export type AlertConditionType = z.infer<typeof alertConditionTypeSchema>;

export const alertOperatorSchema = z.enum(['>', '<', '>=', '<=', '==', '!=', 'contains']);
export type AlertOperator = z.infer<typeof alertOperatorSchema>;

// Notification Channel Types
export const notificationChannelTypeSchema = z.enum(['webhook', 'email', 'browser']);
export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;

// Notification Channels Table
export const notificationChannels = pgTable("notification_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // webhook, email, browser
  config: text("config").notNull(), // JSON string with channel-specific config
  enabled: varchar("enabled", { length: 10 }).notNull().default("true"), // "true" or "false" as strings
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNotificationChannelSchema = createInsertSchema(notificationChannels).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});
export type InsertNotificationChannel = z.infer<typeof insertNotificationChannelSchema>;
export type NotificationChannel = typeof notificationChannels.$inferSelect;

// Alert Rules Table
export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  conditionType: varchar("condition_type", { length: 50 }).notNull(), // cpu_percent, memory_percent, etc.
  operator: varchar("operator", { length: 10 }).notNull(), // >, <, >=, <=, ==, !=, contains
  threshold: varchar("threshold", { length: 255 }).notNull(), // stored as string, can be number or pattern
  durationMinutes: serial("duration_minutes").notNull(), // how long condition must be true
  containerFilter: text("container_filter"), // JSON string with container selection criteria
  channelId: serial("channel_id").notNull(), // foreign key to notification_channels
  enabled: varchar("enabled", { length: 10 }).notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertRule = typeof alertRules.$inferSelect;

// Alert History Table
export const alertHistory = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  ruleId: serial("rule_id").notNull(), // foreign key to alert_rules
  containerId: varchar("container_id", { length: 255 }).notNull(),
  containerName: varchar("container_name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  severity: varchar("severity", { length: 50 }).notNull().default("warning"), // info, warning, critical
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;

// Container Metrics Hourly Table (for historical trend analysis)
export const containerMetricsHourly = pgTable("container_metrics_hourly", {
  id: serial("id").primaryKey(),
  hostId: varchar("host_id", { length: 255 }).notNull(),
  containerId: varchar("container_id", { length: 255 }).notNull(),
  containerName: varchar("container_name", { length: 255 }).notNull(),
  aggregatedAt: timestamp("aggregated_at").notNull(), // Start of the hour
  avgCpuPercent: varchar("avg_cpu_percent", { length: 50 }).notNull(), // stored as string for precision
  maxCpuPercent: varchar("max_cpu_percent", { length: 50 }).notNull(),
  avgMemoryPercent: varchar("avg_memory_percent", { length: 50 }).notNull(),
  maxMemoryPercent: varchar("max_memory_percent", { length: 50 }).notNull(),
  avgMemoryBytes: varchar("avg_memory_bytes", { length: 50 }).notNull(),
  maxMemoryBytes: varchar("max_memory_bytes", { length: 50 }).notNull(),
  totalNetworkRx: varchar("total_network_rx", { length: 50 }).notNull(),
  totalNetworkTx: varchar("total_network_tx", { length: 50 }).notNull(),
  totalBlockRead: varchar("total_block_read", { length: 50 }).notNull(),
  totalBlockWrite: varchar("total_block_write", { length: 50 }).notNull(),
  sampleCount: serial("sample_count").notNull(), // number of data points aggregated
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContainerMetricsHourlySchema = createInsertSchema(containerMetricsHourly).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertContainerMetricsHourly = z.infer<typeof insertContainerMetricsHourlySchema>;
export type ContainerMetricsHourly = typeof containerMetricsHourly.$inferSelect;
