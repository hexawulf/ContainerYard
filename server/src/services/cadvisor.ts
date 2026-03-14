import type { HostConfig } from "../config/hosts";
import type {
  ContainerDetail,
  ContainerStats,
  ContainerSummary,
} from "../models/containers";

interface CadvisorContainer {
  name: string;
  aliases?: string[];
  spec?: {
    image?: string;
    creation_time?: string;
    labels?: Record<string, string>;
    memory?: { limit?: number };
    cpu?: { limit?: number };
  };
  stats?: CadvisorStats[];
}

interface CadvisorStats {
  timestamp: string;
  cpu?: {
    usage?: {
      total?: number;
      per_cpu_usage?: number[];
    };
  };
  memory?: {
    usage?: number;
    working_set?: number;
  };
  network?: {
    interfaces?: Array<{ name?: string; rx_bytes?: number; tx_bytes?: number }>;
  };
  diskio?: {
    io_service_bytes?: Array<{
      device?: string;
      stats?: { Read?: number; Write?: number; read?: number; write?: number };
    }>;
    io_service_bytes_recursive?: Array<{ op?: string; value?: number }>;
  };
}

// Possible cAdvisor API endpoints to try, in order of preference
const CADVISOR_ENDPOINTS = [
  "/api/v1.3/subcontainers",
  "/api/v1.0/subcontainers", 
  "/api/v2.0/subcontainers",
  "/subcontainers",
];

// Error tracking for rate limiting
const errorLogTimestamps = new Map<string, number[]>();
const ERROR_LOG_WINDOW_MS = 60000; // 1 minute window
const MAX_ERRORS_PER_WINDOW = 3; // Max 3 errors per window

function shouldLogError(hostId: string): boolean {
  const now = Date.now();
  const timestamps = errorLogTimestamps.get(hostId) || [];
  
  // Remove old timestamps outside the window
  const recentTimestamps = timestamps.filter(ts => now - ts < ERROR_LOG_WINDOW_MS);
  
  if (recentTimestamps.length >= MAX_ERRORS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  
  recentTimestamps.push(now);
  errorLogTimestamps.set(hostId, recentTimestamps);
  return true;
}

function extractContainerId(name: string): string {
  // Handle different container ID formats
  // Format 1: /system.slice/docker-{containerId}.scope
  // Format 2: /docker/{containerId}
  // Format 3: {containerId}
  
  if (name.includes('/system.slice/docker-') && name.endsWith('.scope')) {
    return name.replace(/^\/system\.slice\/docker-|\.scope$/g, '');
  }
  
  if (name.startsWith('/docker/')) {
    return name.replace(/^\/docker\//, '');
  }
  
  return name.replace(/^\/?docker\/?/, "");
}

function computeName(container: CadvisorContainer): string {
  // Try aliases first, then name, then fall back to the raw name
  const name = (container.aliases?.[0] || container.name || "")
    .replace(/^\/?docker\//, "")
    .replace(/^\//, "");
  
  // If still empty, extract from the raw container name
  if (!name) {
    return extractContainerId(container.name);
  }
  
  return name;
}

function computeStats(host: HostConfig, containerId: string, container: CadvisorContainer): ContainerStats {
  const stats = container.stats ?? [];
  const latest = stats[stats.length - 1];
  const previous = stats[stats.length - 2];

  let cpuPercent = 0;
  if (latest && previous && latest.cpu?.usage?.total && previous.cpu?.usage?.total) {
    const cpuDelta = latest.cpu.usage.total - previous.cpu.usage.total;
    const timeDeltaMs =
      new Date(latest.timestamp).getTime() - new Date(previous.timestamp).getTime();
    const cores = latest.cpu.usage.per_cpu_usage?.length ?? container.spec?.cpu?.limit ?? 1;
    if (cpuDelta > 0 && timeDeltaMs > 0 && cores > 0) {
      cpuPercent = (cpuDelta / (timeDeltaMs * 1e6 * cores)) * 100; // convert ns to ms
    }
  }

  const memoryUsage = latest?.memory?.working_set ?? latest?.memory?.usage ?? 0;
  const memoryLimit = container.spec?.memory?.limit ?? 0;
  const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

  let networkRx = 0;
  let networkTx = 0;
  for (const iface of latest?.network?.interfaces ?? []) {
    networkRx += iface.rx_bytes ?? 0;
    networkTx += iface.tx_bytes ?? 0;
  }

  let blockRead = 0;
  let blockWrite = 0;
  if (latest?.diskio?.io_service_bytes_recursive) {
    for (const entry of latest.diskio.io_service_bytes_recursive) {
      const op = entry.op?.toLowerCase();
      if (op === "read") blockRead += entry.value ?? 0;
      if (op === "write") blockWrite += entry.value ?? 0;
    }
  } else if (latest?.diskio?.io_service_bytes) {
    for (const entry of latest.diskio.io_service_bytes) {
      blockRead += entry.stats?.Read ?? entry.stats?.read ?? 0;
      blockWrite += entry.stats?.Write ?? entry.stats?.write ?? 0;
    }
  }

  return {
    id: containerId,
    hostId: host.id,
    provider: host.provider,
    cpuPercent,
    memoryUsage,
    memoryLimit,
    memoryPercent,
    networkRx,
    networkTx,
    blockRead,
    blockWrite,
    timestamp: latest?.timestamp ?? new Date().toISOString(),
  };
}

function toSummary(host: HostConfig, container: CadvisorContainer): ContainerSummary {
  const labels = container.spec?.labels ?? {};
  // For cAdvisor, we use the original container.name as the ID
  // This is the path that cAdvisor expects (e.g., /docker/{id} or /system.slice/docker-{id}.scope)
  return {
    id: container.name,
    hostId: host.id,
    provider: host.provider,
    name: computeName(container),
    image: container.spec?.image ?? "",
    state: "running",
    status: "running",
    node: host.nodeLabel,
    createdAt: container.spec?.creation_time ?? new Date().toISOString(),
    labels,
    networks: [],
    ports: [],
    composeProject: labels["com.docker.compose.project"] ?? null,
  };
}

class CadvisorService {
  private workingEndpoint: string | null = null;
  private endpointProbePromise: Promise<string> | null = null;

  constructor(private readonly baseUrl: string) {}

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      if (!response.ok) {
        const error = new Error(`cAdvisor request failed: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }
      return (await response.json()) as T;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        const timeoutError = new Error(`cAdvisor request timed out: ${url}`);
        (timeoutError as any).status = 504;
        throw timeoutError;
      }
      throw error;
    }
  }

  /**
   * Probe cAdvisor endpoints to find a working one
   */
  private async probeEndpoint(): Promise<string> {
    if (this.workingEndpoint) {
      return this.workingEndpoint;
    }

    if (this.endpointProbePromise) {
      return this.endpointProbePromise;
    }

    this.endpointProbePromise = (async () => {
      const errors: string[] = [];
      
      for (const endpoint of CADVISOR_ENDPOINTS) {
        try {
          const url = this.buildUrl(endpoint);
          const response = await fetch(url, { 
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
          });
          
          if (response.ok) {
            this.workingEndpoint = endpoint;
            console.log(`[cAdvisor] Found working endpoint: ${endpoint} for ${this.baseUrl}`);
            return endpoint;
          }
        } catch (err: any) {
          errors.push(`${endpoint}: ${err.message}`);
        }
      }

      // If none worked, default to the first one and let it fail with proper error
      console.warn(`[cAdvisor] No working endpoint found for ${this.baseUrl}. Tried: ${errors.join(', ')}`);
      this.workingEndpoint = CADVISOR_ENDPOINTS[0];
      return this.workingEndpoint;
    })();

    return this.endpointProbePromise;
  }

  async listContainers(host: HostConfig): Promise<ContainerSummary[]> {
    try {
      const endpoint = await this.probeEndpoint();
      const containers = await this.fetchJson<CadvisorContainer[]>(endpoint);
      
      const dockerContainers = containers.filter((container) => {
        // Accept containers with docker in path or aliases
        const hasDockerPath = container.name.includes("docker");
        const hasAliases = container.aliases && container.aliases.length > 0;
        return hasDockerPath || hasAliases;
      });
      
      return dockerContainers.map((container) => toSummary(host, container));
    } catch (error: any) {
      if (shouldLogError(host.id)) {
        console.error(`[cAdvisor] Failed to list containers for host ${host.id}:`, error.message);
      }
      
      // Create appropriate error based on the failure
      if (error.status === 404) {
        const notFoundError = new Error(
          `cAdvisor endpoint not found (404). The cAdvisor API path may have changed or cAdvisor may not be running at ${this.baseUrl}`
        );
        (notFoundError as any).status = 502;
        (notFoundError as any).code = 'CADVISOR_ENDPOINT_NOT_FOUND';
        (notFoundError as any).hostId = host.id;
        throw notFoundError;
      }
      
      if (error.status === 504 || error.message?.includes('timed out')) {
        const timeoutError = new Error(
          `cAdvisor request timed out. The cAdvisor service at ${this.baseUrl} is not responding.`
        );
        (timeoutError as any).status = 504;
        (timeoutError as any).code = 'CADVISOR_TIMEOUT';
        (timeoutError as any).hostId = host.id;
        throw timeoutError;
      }
      
      // Generic cAdvisor error
      const cadvisorError = new Error(
        `cAdvisor service error for host ${host.id}: ${error.message}`
      );
      (cadvisorError as any).status = 502;
      (cadvisorError as any).code = 'CADVISOR_ERROR';
      (cadvisorError as any).hostId = host.id;
      (cadvisorError as any).originalError = error.message;
      throw cadvisorError;
    }
  }

  async getContainer(host: HostConfig, containerId: string): Promise<ContainerDetail> {
    try {
      // For cAdvisor, containerId is the full container path (e.g., /docker/{id} or /system.slice/docker-{id}.scope)
      // We need to query cAdvisor using this exact path
      const container = await this.fetchJson<CadvisorContainer>(
        `/api/v1.3/containers${containerId}`,
      );

      const summary = toSummary(host, container);

      return {
        ...summary,
        env: [],
        mounts: [],
        command: null,
        startedAt: container.spec?.creation_time ?? null,
      };
    } catch (error: any) {
      if (shouldLogError(host.id)) {
        console.error(`[cAdvisor] Failed to get container details for host ${host.id}, container ${containerId}:`, error.message);
      }
      throw error;
    }
  }

  async getStats(host: HostConfig, containerId: string): Promise<ContainerStats> {
    try {
      // containerId is the full cAdvisor path
      const container = await this.fetchJson<CadvisorContainer>(
        `/api/v1.3/containers${containerId}`,
      );
      return computeStats(host, containerId, container);
    } catch (error: any) {
      if (shouldLogError(host.id)) {
        console.error(`[cAdvisor] Failed to get container stats for host ${host.id}, container ${containerId}:`, error.message);
      }
      throw error;
    }
  }
}

const cadvisorServiceCache = new Map<string, CadvisorService>();

export function getCadvisorService(host: HostConfig): CadvisorService | null {
  const cadvisorBase = host.cadvisorUrl?.trim();
  if (!cadvisorBase) {
    console.warn(`Host ${host.id} does not have a configured cAdvisor URL`);
    return null;
  }

  try {
    new URL(cadvisorBase);
  } catch {
    console.warn(`Host ${host.id} has invalid cAdvisor URL: ${cadvisorBase}`);
    return null;
  }

  if (!cadvisorServiceCache.has(cadvisorBase)) {
    cadvisorServiceCache.set(cadvisorBase, new CadvisorService(cadvisorBase));
  }

  return cadvisorServiceCache.get(cadvisorBase)!;
}

export type CadStat = {
  name: string;
  id: string;
  image?: string;
  state?: string;
  cpuPct?: number;
  memBytes?: number;
  memLimitBytes?: number;
};

function cpuPctFromSamples(prev: any, curr: any, onlineCpus = 1): number {
  if (!prev || !curr) return 0;
  const du = curr.cpu?.usage?.total || 0;
  const duPrev = prev.cpu?.usage?.total || 0;
  const dt = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
  if (dt <= 0) return 0;
  const deltaUsage = du - duPrev; // ns
  const pct = (deltaUsage / (dt * 1e9)) * 100;
  return Math.max(0, Math.min(pct, 100 * onlineCpus));
}

export async function listContainersOld(baseUrl: string): Promise<CadStat[]> {
  const response = await fetch(`${baseUrl}/api/v1.3/subcontainers`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`cAdvisor ${baseUrl} ${response.status}`);
  const data = await response.json() as CadvisorContainer[];
  
  const out: CadStat[] = [];
  for (const c of data) {
    // More lenient filtering - accept containers with docker in path or aliases
    const hasDockerPath = c.name.includes("docker");
    const hasAliases = c.aliases && c.aliases.length > 0;
    
    if (!hasDockerPath && !hasAliases) continue;
    
    // Improved name extraction
    const name = (c.aliases?.[0] || c.name || "")
      .replace(/^\/?docker\//, "")
      .replace(/^\//, "");
    
    const id = extractContainerId(c.name);
    const last = c.stats?.[c.stats.length - 1];
    const prev = c.stats?.[c.stats.length - 2];
    const online = last?.cpu?.usage?.per_cpu_usage?.length || 1;
    const mem = last?.memory?.working_set ?? last?.memory?.usage ?? 0;
    const lim = c.spec?.memory?.limit ?? 0;
    
    out.push({
      name, id, image: c.spec?.image,
      state: "running",
      cpuPct: cpuPctFromSamples(prev, last, online),
      memBytes: mem,
      memLimitBytes: lim
    });
  }
  
  return out;
}

export async function hostSummary(baseUrl: string) {
  const arr = await listContainersOld(baseUrl);
  const memUsed = arr.reduce((a,b)=>a+(b.memBytes||0),0);
  const avgCpu = arr.length ? arr.reduce((a,b)=>a+(b.cpuPct||0),0)/arr.length : 0;
  const topCpu = arr.slice().sort((a,b)=>(b.cpuPct||0)-(a.cpuPct||0)).slice(0,5);
  const topMem = arr.slice().sort((a,b)=>(b.memBytes||0)-(a.memBytes||0)).slice(0,5);
  return { totalCpu: avgCpu, memUsed, topCpu, topMem, containers: arr.length };
}
