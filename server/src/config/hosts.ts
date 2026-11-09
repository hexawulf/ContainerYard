import { env, remoteHostsConfig } from "./env";
import type { HostSummary, HostProvider } from "../models/containers";

export type HostId = string;

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

const hostDefinitions: Record<string, HostConfig> = {
  [env.CY_LOCAL_HOST_ID]: {
    id: env.CY_LOCAL_HOST_ID,
    name: env.CY_LOCAL_HOST_NAME,
    provider: "DOCKER",
    nodeLabel: env.CY_LOCAL_HOST_ID,
    docker: { socketPath: dockerSocketPath },
  },
  ...Object.fromEntries(
    remoteHostsConfig.map((remote) => [
      remote.id,
      {
        id: remote.id,
        name: remote.name,
        provider: "CADVISOR_ONLY",
        nodeLabel: remote.id,
        dozzleUrl: remote.dozzleUrl ?? null,
        cadvisorUrl: remote.cadvisorUrl,
        cadvisor: { baseUrl: remote.cadvisorUrl },
      } satisfies HostConfig,
    ]),
  ),
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
  const host = Object.prototype.hasOwnProperty.call(hostDefinitions, id)
    ? hostDefinitions[id]
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
