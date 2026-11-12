import type { ContainerEnvVar } from "../models/containers";

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
