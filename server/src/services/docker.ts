import Docker from "dockerode";
import type { HostConfig } from "../config/hosts";
import { getDockerSocketPath } from "../config/hosts";
import type {
  ContainerDetail,
  ContainerEnvVar,
  ContainerMount,
  ContainerStats,
  ContainerSummary,
  NormalizedNetwork,
  NormalizedPort,
} from "../models/containers";

const docker = new Docker({ socketPath: getDockerSocketPath() });

function normalizePorts(ports: Docker.PortInfo[] | undefined): NormalizedPort[] {
  if (!ports) return [];
  return ports.map((port) => ({
    ip: port.IP ?? null,
    privatePort: port.PrivatePort,
    publicPort: port.PublicPort ?? null,
    protocol: port.Type,
  }));
}

type NetworkSettingsLike = {
  Networks?: Record<
    string,
    {
      IPAddress?: string;
      Gateway?: string;
      MacAddress?: string;
    }
  >;
};

function normalizeNetworks(networkSettings: NetworkSettingsLike | undefined | null): NormalizedNetwork[] {
  if (!networkSettings?.Networks) return [];
  return Object.entries(networkSettings.Networks).map(([name, network]) => ({
    name,
    ipAddress: network.IPAddress || null,
    gateway: network.Gateway || null,
    macAddress: network.MacAddress || null,
  }));
}

function normalizeEnv(env?: string[] | null): ContainerEnvVar[] {
  if (!env) return [];
  return env
    .map((item) => {
      const [key, ...rest] = item.split("=");
      return {
        key,
        value: rest.join("=") ?? "",
      };
    })
    .filter((entry) => entry.key);
}

function normalizeMounts(mounts: Docker.MountInspectInfo[] | undefined): ContainerMount[] {
  if (!mounts) return [];
  return mounts.map((mount) => ({
    source: mount.Source,
    destination: mount.Destination,
    mode: mount.Mode,
    rw: mount.RW,
  }));
}

function toContainerSummary(info: Docker.ContainerInfo, host: HostConfig): ContainerSummary {
  return {
    id: info.Id,
    hostId: host.id,
    provider: host.provider,
    name: info.Names?.[0]?.replace(/^\//, "") ?? info.Id,
    image: info.Image,
    state: info.State,
    status: info.Status ?? info.State,
    node: host.nodeLabel,
    createdAt: new Date(info.Created * 1000).toISOString(),
    labels: info.Labels ?? {},
    networks: normalizeNetworks(info.NetworkSettings as unknown as NetworkSettingsLike),
    ports: normalizePorts(info.Ports),
  };
}

export async function listContainers(host: HostConfig): Promise<ContainerSummary[]> {
  const containers = await docker.listContainers({ all: true });
  return containers.map((container) => toContainerSummary(container, host));
}

export async function getContainerDetail(host: HostConfig, containerId: string): Promise<ContainerDetail> {
  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect();

    const ports: NormalizedPort[] = inspect.NetworkSettings?.Ports
      ? Object.entries(inspect.NetworkSettings.Ports).flatMap(([containerPort, bindings]) => {
          const [privatePort, protocol] = containerPort.split("/");
          if (!bindings || bindings.length === 0) {
            return [
              {
                ip: null,
                privatePort: Number(privatePort),
                publicPort: null,
                protocol,
              },
            ];
          }
          return bindings.map((binding) => ({
            ip: binding.HostIp ?? null,
            privatePort: Number(privatePort),
            publicPort: binding.HostPort ? Number(binding.HostPort) : null,
            protocol,
          }));
        })
      : [];

    const summary: ContainerSummary = {
      id: inspect.Id,
      hostId: host.id,
      provider: host.provider,
      name: inspect.Name?.replace(/^\//, "") ?? inspect.Id,
      image: inspect.Config?.Image ?? "",
      state: inspect.State?.Status ?? "unknown",
      status: inspect.State?.Status ?? "unknown",
      node: host.nodeLabel,
      createdAt: inspect.Created
        ? new Date(inspect.Created).toISOString()
        : new Date().toISOString(),
      labels: inspect.Config?.Labels ?? {},
      networks: normalizeNetworks(inspect.NetworkSettings as unknown as NetworkSettingsLike),
      ports,
    };

    return {
      ...summary,
      command: inspect.Config?.Cmd?.join(" ") ?? inspect.Config?.Cmd ?? null,
      env: normalizeEnv(inspect.Config?.Env ?? []),
      mounts: normalizeMounts(inspect.Mounts),
      startedAt: inspect.State?.StartedAt ?? null,
    };
  } catch (error: any) {
    if (error.statusCode === 404) {
      const notFound = new Error(`Container ${containerId} not found on host ${host.id}`);
      (notFound as any).status = 404;
      throw notFound;
    }
    throw error;
  }
}

export async function getContainerStats(host: HostConfig, containerId: string): Promise<ContainerStats> {
  try {
    const container = docker.getContainer(containerId);
    const stats = (await container.stats({ stream: false })) as any;

    const cpuDelta =
      (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
      (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
    const systemDelta =
      (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
    const cpuCount =
      stats.cpu_stats?.online_cpus ?? stats.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;

    const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    const memoryUsageRaw = stats.memory_stats?.usage ?? 0;
    const memoryCache = stats.memory_stats?.stats?.cache ?? 0;
    const memoryUsage = Math.max(0, memoryUsageRaw - memoryCache);
    const memoryLimit = stats.memory_stats?.limit ?? 0;
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      for (const network of Object.values<{ rx_bytes?: number; tx_bytes?: number }>(stats.networks)) {
        networkRx += network.rx_bytes ?? 0;
        networkTx += network.tx_bytes ?? 0;
      }
    }

    let blockRead = 0;
    let blockWrite = 0;
    const ioStats = stats.blkio_stats?.io_service_bytes_recursive ?? [];
    for (const entry of ioStats) {
      const op = entry.op?.toLowerCase?.();
      if (op === "read") {
        blockRead += entry.value ?? 0;
      } else if (op === "write") {
        blockWrite += entry.value ?? 0;
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
      timestamp: stats.read ?? new Date().toISOString(),
    };
  } catch (error: any) {
    if (error.statusCode === 404) {
      const notFound = new Error(`Container ${containerId} not found on host ${host.id}`);
      (notFound as any).status = 404;
      throw notFound;
    }
    throw error;
  }
}

function demuxDockerLogs(buffer: Buffer): string {
  const headerSize = 8;
  const output: string[] = [];
  let offset = 0;

  while (offset + headerSize <= buffer.length) {
    const payloadLength = buffer.readUInt32BE(offset + 4);
    const start = offset + headerSize;
    const end = start + payloadLength;
    if (end > buffer.length) {
      break;
    }
    output.push(buffer.slice(start, end).toString("utf-8"));
    offset = end;
  }

  if (output.length === 0) {
    return buffer.toString("utf-8");
  }

  return output.join("");
}

export async function getContainerLogs(containerId: string, tail: number = 500): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const raw = (await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
      follow: false,
    })) as Buffer;

    return demuxDockerLogs(raw);
  } catch (error: any) {
    if (error.statusCode === 404) {
      const notFound = new Error(`Container ${containerId} not found`);
      (notFound as any).status = 404;
      throw notFound;
    }
    throw error;
  }
}
