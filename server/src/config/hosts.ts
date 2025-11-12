import { env } from "./env";
import type { HostSummary, HostProvider } from "../models/containers";

export type HostId = "piapps" | "piapps2" | "synology";

export interface HostConfig extends HostSummary {
  id: HostId;
  provider: HostProvider;
  nodeLabel: string;
  dozzleUrl?: string | null;
  cadvisorUrl?: string;
  docker?: { socketPath: string };
  cadvisor?: { baseUrl: string };
}

const hostDefinitions: Record<HostId, HostConfig> = {
  piapps: {
    id: "piapps",
    name: "Pi Apps (piapps)",
    provider: "DOCKER",
    nodeLabel: "piapps",
    docker: { socketPath: "/var/run/docker.sock" }
  },
  piapps2: {
    id: "piapps2",
    name: "Pi Apps 2 (piapps2)",
    provider: "CADVISOR_ONLY",
    nodeLabel: "piapps2",
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
};

export function listHosts(): HostSummary[] {
  return Object.values(hostDefinitions).map((host) => ({
    id: host.id,
    name: host.name,
    provider: host.provider,
    nodeLabel: host.nodeLabel,
    dozzleUrl: host.dozzleUrl ?? null,
  }));
}

export function getHost(id: string): HostConfig {
  if (!Object.prototype.hasOwnProperty.call(hostDefinitions, id as HostId)) {
    const error = new Error(`Unknown host: ${id}`);
    (error as any).status = 404;
    throw error;
  }

  const host = hostDefinitions[id as HostId];
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

export function getDockerSocketPath(): string {
  if (env.DOCKER_HOST.startsWith("unix://")) {
    return env.DOCKER_HOST.replace("unix://", "");
  }
  return env.DOCKER_HOST;
}
