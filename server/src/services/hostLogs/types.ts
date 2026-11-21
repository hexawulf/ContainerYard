export type HostLogKind = "file" | "journal" | "docker" | "pm2";

export const REMOTE_SOURCE_ID_RE = /^[a-z0-9_-]{1,64}$/;

export interface HostLogSource {
  name: string;
  title: string;
  kind: HostLogKind;
  available: boolean;
  /** Populated only for local file sources; never sent for remote sources. */
  path?: string;
  hint?: string;
  size?: number;
  mtime?: string;
}

export type HostLogProviderErrorReason =
  | "agent_unreachable"
  | "agent_auth"
  | "agent_logs_off"
  | "agent_rate_limited"
  | "agent_error";

export interface HostLogListResult {
  sources: HostLogSource[];
  error?: {
    reason: HostLogProviderErrorReason;
    message: string;
  };
  message?: string;
}

export interface HostLogTailOptions {
  lines: number;
  grep?: string;
}

export interface HostLogTailResult {
  lines: string[];
  truncated?: boolean;
  redacted?: number;
}

export class HostLogSourceError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "HostLogSourceError";
  }
}

export interface LocalDockerTarget {
  socketPath: string;
  containerId: string;
}

export interface HostLogProvider {
  readonly type: "local" | "pideck-agent";
  list(): Promise<HostLogListResult>;
  tail(name: string, options: HostLogTailOptions): Promise<HostLogTailResult>;
  resolveLocalFile?(name: string): Promise<string | null>;
  resolveLocalDockerContainer?(name: string): Promise<LocalDockerTarget | null>;
}
