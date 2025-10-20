export type HostProvider = "DOCKER" | "CADVISOR_ONLY";

export interface HostSummary {
  id: string;
  name: string;
  provider: HostProvider;
  nodeLabel: string;
  dozzleUrl?: string | null;
}

export interface NormalizedPort {
  ip?: string | null;
  privatePort: number;
  publicPort?: number | null;
  protocol: string;
}

export interface NormalizedNetwork {
  name: string;
  ipAddress?: string | null;
  gateway?: string | null;
  macAddress?: string | null;
}

export interface ContainerSummary {
  id: string;
  hostId: string;
  provider: HostProvider;
  name: string;
  image: string;
  state: string;
  status: string;
  node: string;
  createdAt: string;
  labels: Record<string, string>;
  networks: NormalizedNetwork[];
  ports: NormalizedPort[];
}

export interface ContainerEnvVar {
  key: string;
  value: string;
}

export interface ContainerMount {
  source?: string | null;
  destination: string;
  mode?: string | null;
  rw?: boolean | null;
}

export interface ContainerDetail extends ContainerSummary {
  command?: string | null;
  env: ContainerEnvVar[];
  mounts: ContainerMount[];
  startedAt?: string | null;
}

export interface HostStats {
  id: string;
  hostId: string;
  provider: HostProvider;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  timestamp: string;
}

export interface ContainerStats {
  id: string;
  hostId: string;
  provider: HostProvider;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  timestamp: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: "ADMIN" | "VIEWER";
}

export interface ContainerLogsResponse {
  content: string;
  truncated: boolean;
}

export interface DozzleLinkResponse {
  link: string;
}

export interface NormalizedStats {
  cpuPct: number;
  memPct: number;
  memBytes: number;
  blkRead: number;
  blkWrite: number;
  netRx: number;
  netTx: number;
  ts: string;
}
