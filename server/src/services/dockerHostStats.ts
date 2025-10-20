import Docker from "dockerode";
import { parseContainerInstant } from "../lib/parseDockerStats";
import { getDockerSocketPath } from "../config/hosts";

const docker = new Docker({ socketPath: getDockerSocketPath() });

export interface DockerHostSummary {
  id: string;
  provider: string;
}

export type HostStats = {
  hostId: string;
  provider: string;
  cpuPercent: number;       // sum of container CPU% across cores
  memoryUsage: number;      // sum working-set across containers
  memoryLimit: number;      // best-effort cap (max observed container limit)
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  timestamp: string;
};

export async function getDockerHostStats(host: DockerHostSummary): Promise<HostStats> {
  const list = await docker.listContainers({ all: false });

  let cpuPercent = 0;
  let memoryUsage = 0;
  let memoryLimit = 0;
  let networkRx = 0;
  let networkTx = 0;
  let blockRead = 0;
  let blockWrite = 0;

  await Promise.all(list.map(async (c) => {
    try {
      const container = docker.getContainer(c.Id);
      const raw = await container.stats({ stream: false });
      const s = parseContainerInstant(raw);

      cpuPercent += s.cpuPct;
      memoryUsage += s.memBytes;
      memoryLimit = Math.max(memoryLimit, raw?.memory_stats?.limit ?? 0);
      networkRx += s.netRx;
      networkTx += s.netTx;
      blockRead += s.blkRead;
      blockWrite += s.blkWrite;
    } catch (err) {
      // Skip containers that error during stats collection
      console.warn(`Failed to collect stats for container ${c.Id}:`, err);
    }
  }));

  const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

  // Return normalized numeric stats (never null/undefined)
  return {
    hostId: host.id,
    provider: host.provider,
    cpuPercent: Number((cpuPercent || 0).toFixed(2)),
    memoryUsage: Number(memoryUsage || 0),
    memoryLimit: Number(memoryLimit || 0),
    memoryPercent: Number(((memoryLimit > 0 ? memoryUsage / memoryLimit : 0) * 100).toFixed(2)),
    networkRx: Number(networkRx || 0),
    networkTx: Number(networkTx || 0),
    blockRead: Number(blockRead || 0),
    blockWrite: Number(blockWrite || 0),
    timestamp: new Date().toISOString(),
  };
}
