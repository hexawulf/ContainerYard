import { HttpError, errorInfo, errorMessage } from "../lib/httpError";
import type { HostConfig } from "../config/hosts";
import { statsCache } from "../lib/ttlCache";
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

/**
 * True only for cgroups that are Docker containers: the path ends in a 64-hex
 * container ID, as `/docker/<id>` (cgroup v1, e.g. NAS appliances) or
 * `/system.slice/docker-<id>.scope` (cgroup v2). Excludes the parent `/docker`
 * cgroup and daemon units such as `/system.slice/pkg-ContainerManager-dockerd.service`,
 * which the old "path contains docker" test let through on NAS hosts.
 */
export function isDockerContainerPath(name: string): boolean {
  return /\/docker[-/][0-9a-f]{64}(?:\.scope)?$/i.test(name);
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

/**
 * Display name for a cAdvisor container: its first alias (the Docker name,
 * when cAdvisor can see the Docker daemon), else the container id taken from
 * the cgroup path. (A cgroup v2 container without aliases used to be shown
 * as "system.slice/docker-<id>.scope".)
 */
export function cadvisorDisplayName(aliases: string[] | undefined, cgroupName: string | undefined): string {
  const alias = aliases?.[0];
  if (alias) return alias.replace(/^\/?docker\//, "").replace(/^\//, "");
  return extractContainerId(cgroupName ?? "");
}

function computeName(container: CadvisorContainer): string {
  return cadvisorDisplayName(container.aliases, container.name);
}

/**
 * CPU use between two cAdvisor samples, as a percentage of ONE core (the
 * `docker stats` convention, also used for Docker hosts): 100 = one core
 * fully busy, 250 = two and a half cores.
 *
 * It needs no core count. The previous code divided by `per_cpu_usage.length`
 * and, on cgroup v2 hosts where that array is absent, by `spec.cpu.limit`,
 * which is CPU shares (e.g. 1024), so the result was close to zero.
 */
export function cpuPercentFromSamples(
  previous: { timestamp: string; cpu?: { usage?: { total?: number } } } | undefined,
  latest: { timestamp: string; cpu?: { usage?: { total?: number } } } | undefined,
): number {
  const prevTotal = previous?.cpu?.usage?.total;
  const latestTotal = latest?.cpu?.usage?.total;
  if (!previous || !latest || prevTotal === undefined || latestTotal === undefined) return 0;
  const elapsedNs =
    (new Date(latest.timestamp).getTime() - new Date(previous.timestamp).getTime()) * 1e6;
  const usedNs = latestTotal - prevTotal;
  if (!(elapsedNs > 0) || !(usedNs > 0)) return 0;
  return (usedNs / elapsedNs) * 100;
}

function assertContainerPath(containerId: string): void {
  // The id is appended to the cAdvisor URL. Only real container cgroup paths
  // are allowed, so it cannot be used to reach other paths on that host.
  if (!isDockerContainerPath(containerId)) {
    throw new HttpError("Container not found", 404);
  }
}

function computeStats(host: HostConfig, containerId: string, container: CadvisorContainer): ContainerStats {
  const stats = container.stats ?? [];
  const latest = stats[stats.length - 1];
  const previous = stats[stats.length - 2];

  const cpuPercent = cpuPercentFromSamples(previous, latest);

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
        throw new HttpError(`cAdvisor request failed: ${response.status} ${response.statusText}`, response.status);
      }
      return (await response.json()) as T;
    } catch (error: unknown) {
      const { name } = errorInfo(error);
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new HttpError("cAdvisor request timed out", 504);
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
        } catch (err: unknown) {
          errors.push(`${endpoint}: ${errorMessage(err)}`);
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
      
      const dockerContainers = containers.filter((container) => isDockerContainerPath(container.name));
      
      return dockerContainers.map((container) => toSummary(host, container));
    } catch (error: unknown) {
      const { message, status } = errorInfo(error);
      if (shouldLogError(host.id)) {
        console.error(`[cAdvisor] Failed to list containers for host ${host.id}:`, message);
      }
      
      // Create appropriate error based on the failure (never echo internal baseUrl to clients)
      if (status === 404) {
        throw new HttpError(`cAdvisor endpoint not found (404) for host ${host.id}`, 502, {
          code: 'CADVISOR_ENDPOINT_NOT_FOUND',
          hostId: host.id,
        });
      }
      
      if (status === 504 || message.includes('timed out')) {
        throw new HttpError(`cAdvisor request timed out for host ${host.id}`, 504, {
          code: 'CADVISOR_TIMEOUT',
          hostId: host.id,
        });
      }
      
      // Generic cAdvisor error
      throw new HttpError(`cAdvisor service error for host ${host.id}: ${message}`, 502, {
        code: 'CADVISOR_ERROR',
        hostId: host.id,
        originalError: message,
      });
    }
  }

  async getContainer(host: HostConfig, containerId: string): Promise<ContainerDetail> {
    assertContainerPath(containerId);
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
    } catch (error: unknown) {
      if (shouldLogError(host.id)) {
        console.error(`[cAdvisor] Failed to get container details for host ${host.id}, container ${containerId}:`, errorMessage(error));
      }
      throw error;
    }
  }

  async getStats(host: HostConfig, containerId: string): Promise<ContainerStats> {
    assertContainerPath(containerId);
    return statsCache.get(`cadvisor:ctr:${host.id}:${containerId}`, async () => {
      try {
        // containerId is the full cAdvisor path
        const container = await this.fetchJson<CadvisorContainer>(
          `/api/v1.3/containers${containerId}`,
        );
        return computeStats(host, containerId, container);
      } catch (error: unknown) {
        if (shouldLogError(host.id)) {
          console.error(`[cAdvisor] Failed to get container stats for host ${host.id}, container ${containerId}:`, errorMessage(error));
        }
        throw error;
      }
    });
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

export async function listContainersOld(baseUrl: string): Promise<CadStat[]> {
  const response = await fetch(`${baseUrl}/api/v1.3/subcontainers`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`cAdvisor ${baseUrl} ${response.status}`);
  const data = await response.json() as CadvisorContainer[];
  
  const out: CadStat[] = [];
  for (const c of data) {
    if (!isDockerContainerPath(c.name)) continue;
    
    const name = computeName(c);

    const id = extractContainerId(c.name);
    const last = c.stats?.[c.stats.length - 1];
    const prev = c.stats?.[c.stats.length - 2];
    const mem = last?.memory?.working_set ?? last?.memory?.usage ?? 0;
    const lim = c.spec?.memory?.limit ?? 0;
    
    out.push({
      name, id, image: c.spec?.image,
      state: "running",
      cpuPct: cpuPercentFromSamples(prev, last),
      memBytes: mem,
      memLimitBytes: lim
    });
  }
  
  return out;
}

export async function hostSummary(baseUrl: string) {
  return statsCache.get(`cadvisor:summary:${baseUrl}`, async () => {
    const arr = await listContainersOld(baseUrl);
    const memUsed = arr.reduce((a,b)=>a+(b.memBytes||0),0);
    const avgCpu = arr.length ? arr.reduce((a,b)=>a+(b.cpuPct||0),0)/arr.length : 0;
    const topCpu = arr.slice().sort((a,b)=>(b.cpuPct||0)-(a.cpuPct||0)).slice(0,5);
    const topMem = arr.slice().sort((a,b)=>(b.memBytes||0)-(a.memBytes||0)).slice(0,5);
    return { totalCpu: avgCpu, memUsed, topCpu, topMem, containers: arr.length };
  });
}
