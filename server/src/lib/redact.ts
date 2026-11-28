import type { ContainerDetail, ContainerEnvVar, ContainerMount } from "../models/containers";

export const HIDDEN_VALUE = "[hidden]";

/**
 * Environment variables routinely hold credentials (database URLs, API keys,
 * tokens). Only admins see the values; everyone else gets the variable names
 * with every value replaced. All values are hidden, not just the ones whose
 * name looks secret, because a name-based guess misses things like
 * DATABASE_URL or REDIS_URL with a password inside.
 */
export function envForRole(env: ContainerEnvVar[] | undefined, role: string | undefined): ContainerEnvVar[] {
  if (!env) return [];
  if (role === "ADMIN") return env;
  return env.map((entry) => ({ key: entry.key, value: HIDDEN_VALUE }));
}

/**
 * Command-line arguments carry secrets as often as env does (for example
 * `redis-server --requirepass <password>`). Config.Cmd may hold only arguments
 * when the image sets an entrypoint, so no token is safe to keep: non-admins
 * get the whole command hidden.
 */
export function commandForRole(command: string | null | undefined, role: string | undefined): string | null {
  if (command === undefined || command === null) return null;
  if (role === "ADMIN") return command;
  return command.trim() ? HIDDEN_VALUE : command;
}

/** Host-side mount paths reveal host layout; non-admins see the container side only. */
export function mountsForRole(mounts: ContainerMount[] | undefined, role: string | undefined): ContainerMount[] {
  if (!mounts) return [];
  if (role === "ADMIN") return mounts;
  return mounts.map((m) => ({ ...m, source: m.source ? HIDDEN_VALUE : m.source }));
}

/** Applies every per-role redaction to a container detail response. */
export function containerDetailForRole(detail: ContainerDetail, role: string | undefined): ContainerDetail {
  return {
    ...detail,
    command: commandForRole(detail.command, role),
    env: envForRole(detail.env, role),
    mounts: mountsForRole(detail.mounts, role),
  };
}

function hideValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideValues);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hideValues(v)]));
  }
  return HIDDEN_VALUE;
}

function urlOrigin(value: unknown): string {
  if (typeof value !== "string") return HIDDEN_VALUE;
  try {
    return `${new URL(value).origin}/${HIDDEN_VALUE}`;
  } catch {
    return HIDDEN_VALUE;
  }
}

/**
 * Notification channel configs hold credentials: a webhook URL's path is often
 * the secret itself, and custom headers carry bearer tokens. Admins get the
 * stored JSON unchanged. Everyone else gets the same keys with every value
 * hidden, except `url`, which is reduced to its origin so the target is still
 * recognisable.
 */
export function channelConfigForRole(config: string, role: string | undefined): string {
  if (role === "ADMIN") return config;
  let parsed: unknown;
  try {
    parsed = JSON.parse(config);
  } catch {
    return JSON.stringify(HIDDEN_VALUE);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return JSON.stringify(HIDDEN_VALUE);
  }
  const redacted = Object.fromEntries(
    Object.entries(parsed).map(([k, v]) => [k, k === "url" ? urlOrigin(v) : hideValues(v)]),
  );
  return JSON.stringify(redacted);
}
