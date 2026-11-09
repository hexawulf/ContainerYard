import { env } from "./env";
import type { HostSummary, HostProvider } from "../models/containers";

export type HostId = "piapps" | "piapps2" | "synology" | "ds718";

export interface HostConfig extends HostSummary {
  id: HostId;
  provider: HostProvider;
  nodeLabel: string;
  dozzleUrl?: string | null;
  cadvisorUrl?: string;
  docker?: { socketPath: string };
  cadvisor?: { baseUrl: string };
}

const dockerSocketPath = env.DOCKER_HOST.replace(/^unix:\/\//, "") || "/var/run/docker.sock";

const hostDefinitions: Partial<Record<HostId, HostConfig>> = {
  piapps: {
    id: "piapps",
    name: "Pi Apps (piapps)",
    provider: "DOCKER",
    nodeLabel: "piapps",
    docker: { socketPath: dockerSocketPath }
  },
  piapps2: {
    id: "piapps2",
    name: "Pi Apps 2 (piapps2)",
    provider: "CADVISOR_ONLY",
    nodeLabel: "piapps2",
    dozzleUrl: env.PIAPPS2_DOZZLE_URL ?? null,
    cadvisorUrl: env.PIAPPS2_CADVISOR_URL,
    cadvisor: { baseUrl: env.PIAPPS2_CADVISOR_URL! }
  },
  synology: {
    id: "synology",
    name: "Synology (synology)",
    provider: "CADVISOR_ONLY",
    nodeLabel: "synology",
    dozzleUrl: env.SYNOLOGY_DOZZLE_URL ?? null,
    cadvisorUrl: env.SYNOLOGY_CADVISOR_URL,
    cadvisor: { baseUrl: env.SYNOLOGY_CADVISOR_URL! }
  },
  // Optional: brixhouse DS718+ (Flensburg), reached over WireGuard via a socat
  // relay on piapps4. Only listed when DS718_CADVISOR_URL is set.
  ...(env.DS718_CADVISOR_URL
    ? {
        ds718: {
          id: "ds718",
          name: "DS718+ brixhouse (ds718)",
          provider: "CADVISOR_ONLY",
          nodeLabel: "ds718",
          dozzleUrl: env.DS718_DOZZLE_URL ?? null,
          cadvisorUrl: env.DS718_CADVISOR_URL,
          cadvisor: { baseUrl: env.DS718_CADVISOR_URL },
        } satisfies HostConfig,
      }
    : {}),
};

export function listHosts(): HostSummary[] {
  return Object.values(hostDefinitions).filter((host): host is HostConfig => Boolean(host)).map((host) => ({
    id: host.id,
    name: host.name,
    provider: host.provider,
    nodeLabel: host.nodeLabel,
    dozzleUrl: host.dozzleUrl ?? null,
  }));
}

export function getHost(id: string): HostConfig {
  const host = Object.prototype.hasOwnProperty.call(hostDefinitions, id as HostId)
    ? hostDefinitions[id as HostId]
    : undefined;
  if (!host) {
    const error = new Error(`Unknown host: ${id}`);
    (error as any).status = 404;
    throw error;
  }
  if (host.provider === "CADVISOR_ONLY" && !host.cadvisorUrl) {
    const error = new Error(`Host ${id} is misconfigured: missing cAdvisor URL`);
    (error as any).status = 500;
    throw error;
  }

  return host;
}

export function getDozzleLink(hostId: HostId): string | null {
  const host = getHost(hostId);
  return host.dozzleUrl ?? null;
}
