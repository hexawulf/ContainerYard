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
