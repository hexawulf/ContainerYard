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

function extractContainerId(name: string): string {
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
  return {
    id: extractContainerId(container.name),
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
  constructor(private readonly baseUrl: string) {}

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(this.buildUrl(path));
    if (!response.ok) {
      const error = new Error(`cAdvisor request failed: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }
    return (await response.json()) as T;
  }

  async listContainers(host: HostConfig): Promise<ContainerSummary[]> {
    const containers = await this.fetchJson<CadvisorContainer[]>(`/api/v1.3/subcontainers`);
    
    // Log debug info if no containers found
    if (containers.length === 0) {
      console.warn("cadvisor zero-length payload", { host: host.id, url: this.baseUrl });
    }
    
    const dockerContainers = containers.filter((container) => {
      // Accept containers with docker in path or aliases
      const hasDockerPath = container.name.includes("docker");
      const hasAliases = container.aliases && container.aliases.length > 0;
      return hasDockerPath || hasAliases;
    });
    
    // Log debug info if filtering removes all containers
    if (dockerContainers.length === 0 && containers.length > 0) {
      console.warn("cadvisor filtering removed all containers", { 
        host: host.id, 
        total: containers.length, 
        sample: containers.slice(0, 2).map(c => ({ name: c.name, aliases: c.aliases }))
      });
    }
    
    return dockerContainers.map((container) => toSummary(host, container));
  }

  async getContainer(host: HostConfig, containerId: string): Promise<ContainerDetail> {
    const container = await this.fetchJson<CadvisorContainer>(
      `/api/v1.3/containers/docker/${containerId}`,
    );

    const summary = toSummary(host, container);

    return {
      ...summary,
      env: [],
      mounts: [],
      command: null,
      startedAt: container.spec?.creation_time ?? null,
    };
  }

  async getStats(host: HostConfig, containerId: string): Promise<ContainerStats> {
    const container = await this.fetchJson<CadvisorContainer>(
      `/api/v1.3/containers/docker/${containerId}`,
    );
    return computeStats(host, containerId, container);
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

export async function listContainers(baseUrl: string): Promise<CadStat[]> {
  const response = await fetch(`${baseUrl}/api/v1.3/subcontainers`);
  if (!response.ok) throw new Error(`cAdvisor ${baseUrl} ${response.status}`);
  const data = await response.json() as CadvisorContainer[];
  
  // Log debug info if no containers found
  if (data.length === 0) {
    console.warn("cadvisor zero-length payload", { baseUrl, sample: data?.slice?.(0,2) });
  }
  
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
  
  // Log debug info if filtering removes all containers
  if (out.length === 0 && data.length > 0) {
    console.warn("cadvisor filtering removed all containers", { 
      baseUrl, 
      total: data.length, 
      sample: data.slice(0, 2).map(c => ({ name: c.name, aliases: c.aliases, hasSpec: !!c.spec }))
    });
  }
  
  return out;
}

export async function hostSummary(baseUrl: string) {
  const arr = await listContainers(baseUrl);
  const memUsed = arr.reduce((a,b)=>a+(b.memBytes||0),0);
  const avgCpu = arr.length ? arr.reduce((a,b)=>a+(b.cpuPct||0),0)/arr.length : 0;
  const topCpu = arr.slice().sort((a,b)=>(b.cpuPct||0)-(a.cpuPct||0)).slice(0,5);
  const topMem = arr.slice().sort((a,b)=>(b.memBytes||0)-(a.memBytes||0)).slice(0,5);
  return { totalCpu: avgCpu, memUsed, topCpu, topMem, containers: arr.length };
}
