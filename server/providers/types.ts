import type { ContainerSummary, ContainerDetail, LogLine, StatsDataPoint, EnvVar, ContainerAction } from '@shared/schema';

export interface IProvider {
  // Container operations
  listContainers(): Promise<ContainerSummary[]>;
  getContainer(id: string): Promise<ContainerDetail | undefined>;
  performAction(id: string, action: ContainerAction): Promise<void>;
  
  // Environment variables
  getEnvVars(id: string): Promise<EnvVar[]>;
  
  // Log operations
  getLogs(id: string, options?: { from?: string; to?: string; query?: string }): Promise<LogLine[]>;
  streamLogs(id: string, callback: (log: LogLine) => void): () => void;
  
  // Stats operations
  streamStats(id: string, callback: (stats: StatsDataPoint) => void): () => void;
  
  // Terminal/exec operations
  createExecSession(id: string, cmd?: string[], outputCallback?: (data: string) => void): Promise<string>;
  writeToExec(sessionId: string, data: string): void;
  resizeExec(sessionId: string, cols: number, rows: number): void;
  closeExec(sessionId: string): void;
}
