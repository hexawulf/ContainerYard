import { env, remoteHostsConfig } from "../../config/env";
import { createLocalHostLogProvider } from "./localProvider";
import { createPideckAgentProvider } from "./pideckAgentProvider";
import type { HostLogProvider } from "./types";

const providerCache = new Map<string, HostLogProvider>();

export function getProvider(hostId: string): HostLogProvider | null {
  const existing = providerCache.get(hostId);
  if (existing) return existing;

  if (hostId === env.HOSTLOGS_LOCAL_HOST) {
    const provider = createLocalHostLogProvider({ hostId });
    providerCache.set(hostId, provider);
    return provider;
  }

  const remote = remoteHostsConfig.find((h) => h.id === hostId);
  if (remote?.logs?.type === "pideck-agent") {
    const provider = createPideckAgentProvider({ hostId, config: remote.logs });
    providerCache.set(hostId, provider);
    return provider;
  }

  return null;
}

export function clearProviderCache(): void {
  providerCache.clear();
}

export * from "./types";
export { createLocalHostLogProvider } from "./localProvider";
export { createPideckAgentProvider } from "./pideckAgentProvider";
