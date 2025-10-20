import Docker from "dockerode";
import type { HostConfig } from "../config/hosts";
import { getDockerSocketPath } from "../config/hosts";
import { parseContainerInstant } from "../lib/parseDockerStats";
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
    const raw = (await container.stats({ stream: false })) as any;

    const parsed = parseContainerInstant(raw);

    return {
      id: containerId,
      hostId: host.id,
      provider: host.provider,
      cpuPercent: parsed.cpuPct,
      memoryUsage: parsed.memBytes,
      memoryLimit: raw.memory_stats?.limit ?? 0,
      memoryPercent: parsed.memPct,
      networkRx: parsed.netRx,
      networkTx: parsed.netTx,
      blockRead: parsed.blkRead,
      blockWrite: parsed.blkWrite,
      timestamp: parsed.ts,
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

export interface LogOptions {
  tail?: number;
  since?: number | string;
  stdout?: boolean;
  stderr?: boolean;
  grep?: string;
}

export async function getHostStats(host: HostConfig): Promise<ContainerStats> {
  const info = await docker.info();
  const memoryTotal = info.MemTotal ?? 0;
  return {
    id: host.id,
    hostId: host.id,
    provider: host.provider,
    cpuPercent: info.NCPU ? (info.NCPU / (info.NCPU || 1)) * 100 : 0,
    memoryUsage: 0,
    memoryLimit: memoryTotal,
    memoryPercent: 0,
    networkRx: 0,
    networkTx: 0,
    blockRead: 0,
    blockWrite: 0,
    timestamp: new Date().toISOString(),
  };
}

export async function getContainerLogs(containerId: string, options: LogOptions = {}): Promise<string> {
  try {
    const { tail = 500, since, stdout = true, stderr = true } = options;
    
    const container = docker.getContainer(containerId);
    const logOpts: any = {
      stdout,
      stderr,
      tail: Math.min(tail, 5000),
      timestamps: true,
      follow: false,
    };

    if (since) {
      if (typeof since === 'number') {
        logOpts.since = Math.floor(Date.now() / 1000) - since;
      } else {
        logOpts.since = Math.floor(new Date(since).getTime() / 1000);
      }
    }

    const raw = (await container.logs(logOpts)) as Buffer;
    let logs = demuxDockerLogs(raw);

    if (options.grep) {
      const pattern = options.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(pattern, 'i');
      logs = logs.split('\n').filter(line => regex.test(line)).join('\n');
    }

    return logs;
  } catch (error: any) {
    if (error.statusCode === 404) {
      const notFound = new Error(`Container ${containerId} not found`);
      (notFound as any).status = 404;
      throw notFound;
    }
    throw error;
  }
}

export async function streamContainerLogs(
  containerId: string,
  options: LogOptions,
  onData: (line: string) => void,
  onError: (err: Error) => void
): Promise<() => void> {
  try {
    const { stdout = true, stderr = true, grep } = options;
    
    const container = docker.getContainer(containerId);
    const stream = await container.logs({
      stdout,
      stderr,
      follow: true,
      tail: 100,
      timestamps: true,
    });

    const pattern = grep ? new RegExp(grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    
    let buffer = '';
    stream.on('data', (chunk: Buffer) => {
      const text = demuxDockerLogs(chunk);
      buffer += text;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line && (!pattern || pattern.test(line))) {
          onData(line);
        }
      }
    });

    stream.on('error', onError);

    return () => {
      stream.destroy();
    };
  } catch (error: any) {
    if (error.statusCode === 404) {
      const notFound = new Error(`Container ${containerId} not found`);
      (notFound as any).status = 404;
      throw notFound;
    }
    throw error;
  }
}
