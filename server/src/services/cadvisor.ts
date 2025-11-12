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
  if (container.aliases && container.aliases.length > 0) {
    return container.aliases[0];
  }
  return extractContainerId(container.name);
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
    return containers
      .filter((container) => container.name.includes("docker"))
      .map((container) => toSummary(host, container));
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

export function getCadvisorService(host: HostConfig): CadvisorService {
  if (!host.cadvisorUrl) {
    throw new Error(`Host ${host.id} does not have a configured cAdvisor URL`);
  }

  if (!cadvisorServiceCache.has(host.cadvisorUrl)) {
    cadvisorServiceCache.set(host.cadvisorUrl, new CadvisorService(host.cadvisorUrl));
  }

  return cadvisorServiceCache.get(host.cadvisorUrl)!;
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

function cpuPctFromSamples(prev: any, curr: any): number {
  // Uses cumulative cpu usage & timestamp ns; clamp to [0, 1000%] for multi-core
  if (!prev || !curr) return 0;
  const du = curr.cpu.usage.total - prev.cpu.usage.total;
  const dt = (curr.timestamp - prev.timestamp) || 1;
  const pct = (du / dt) * 100; // cAdvisor normalizes to 1 core
  return Math.max(0, Math.min(pct, 1000));
}

export async function listContainers(baseUrl: string): Promise<CadStat[]> {
  const response = await fetch(`${baseUrl}/api/v1.3/subcontainers`);
  if (!response.ok) throw new Error(`cAdvisor ${baseUrl} ${response.status}`);
  const data = await response.json() as CadvisorContainer[];
  const out: CadStat[] = [];
  for (const c of data) {
    if (!c.spec || !c.aliases) continue;
    const name = (c.aliases[0] || c.name || "").replace(/^\/docker\//, "");
    const id = extractContainerId(c.name);
    const last = c.stats?.[c.stats.length - 1];
    const prev = c.stats?.[c.stats.length - 2];
    const mem = last?.memory?.working_set ?? last?.memory?.usage ?? 0;
    const lim = c.spec?.memory?.limit ?? 0;
    out.push({
      name, id, image: c.spec?.image,
      state: "running",
      cpuPct: cpuPctFromSamples(prev, last),
      memBytes: mem,
      memLimitBytes: lim
    });
  }
  return out;
}

export async function hostSummary(baseUrl: string) {
  const arr = await listContainers(baseUrl);
  const totalCpu = arr.reduce((a,b)=>a+(b.cpuPct||0),0);
  const topCpu = arr.slice().sort((a,b)=>(b.cpuPct||0)-(a.cpuPct||0)).slice(0,5);
  const topMem = arr.slice().sort((a,b)=>(b.memBytes||0)-(a.memBytes||0)).slice(0,5);
  const memUsed = arr.reduce((a,b)=>a+(b.memBytes||0),0);
  return { totalCpu, memUsed, topCpu, topMem, containers: arr.length };
}
