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
    labels: container.spec?.labels ?? {},
    networks: [],
    ports: [],
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
