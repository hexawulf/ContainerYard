import type { HostSummary } from "@shared/monitoring";

/** localStorage key the Dashboard and Host Logs page share for the last host. */
export const HOST_STORAGE_KEY = "cy.selectedHost";

/** Path to a host's log page, with the id URL-encoded. */
export function hostLogsPath(hostId: string): string {
  return `/hosts/${encodeURIComponent(hostId)}/logs`;
}

/** Read the stored host id; never throws (storage may be unavailable). */
export function readStoredHostId(): string | null {
  try {
    return globalThis.localStorage?.getItem(HOST_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Persist the selected host id; never throws. */
export function storeHostId(hostId: string): void {
  try {
    globalThis.localStorage?.setItem(HOST_STORAGE_KEY, hostId);
  } catch {
    /* storage unavailable (private mode, quota) — ignore */
  }
}

/** Human label for a host id: its name if known, else the id itself. */
export function hostDisplayName(hosts: HostSummary[], id: string): string {
  return hosts.find((host) => host.id === id)?.name ?? id;
}
