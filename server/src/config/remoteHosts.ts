/**
 * Parsing and validation for CY_REMOTE_HOSTS (remote cAdvisor-only hosts,
 * optionally paired with a read-only PiDeck log agent).
 *
 * Kept free of side effects (no env parsing at import time) so it can be unit
 * tested on its own. Error messages name the offending entry/field but never
 * echo the configured values, which may contain internal hostnames or URLs.
 */
import { z } from "zod";

export const HOST_ID_REGEX = /^[a-z0-9-]{1,32}$/;
export const HOSTLOG_TOKEN_ENV_REGEX = /^CY_HOSTLOG_TOKEN_[A-Z0-9_]{1,32}$/;

function isOriginOnlyHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.search || u.hash) return false;
    if (u.pathname !== "" && u.pathname !== "/") return false;
    return Boolean(u.host);
  } catch {
    return false;
  }
}

export const pideckAgentLogsSchema = z.object({
  type: z.literal("pideck-agent"),
  url: z.string().refine(isOriginOnlyHttpUrl, "url must be http(s)://<host>:<port> with no path"),
  tokenEnv: z
    .string()
    .regex(HOSTLOG_TOKEN_ENV_REGEX, "tokenEnv must match ^CY_HOSTLOG_TOKEN_[A-Z0-9_]{1,32}$"),
  timeoutMs: z.number().int().min(1000).max(9000).default(5000),
});

export type RemoteHostLogsConfig = z.infer<typeof pideckAgentLogsSchema>;

const remoteHostBaseSchema = z.object({
  id: z.string().regex(HOST_ID_REGEX, "must match /^[a-z0-9-]{1,32}$/"),
  name: z.string().min(1, "name is required"),
  cadvisorUrl: z.string().url("cadvisorUrl must be a valid URL"),
  dozzleUrl: z.string().url("dozzleUrl must be a valid URL").optional(),
});

export interface RemoteHostEnvEntry extends z.infer<typeof remoteHostBaseSchema> {
  logs?: RemoteHostLogsConfig;
}

/**
 * Parse `CY_REMOTE_HOSTS` (JSON array of `{id, name, cadvisorUrl, dozzleUrl?, logs?}`).
 * Empty or unset means no remote hosts. Ids must be unique, including against
 * the local host id. Unknown `logs.type` values warn at startup and are ignored
 * rather than crashing.
 */
export function parseRemoteHostsEnv(
  raw: string | undefined,
  localHostId = "local",
  warn: (message: string) => void = console.warn,
): RemoteHostEnvEntry[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid CY_REMOTE_HOSTS: must be a valid JSON array");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid CY_REMOTE_HOSTS: must be a JSON array");
  }

  const seenIds = new Set<string>([localHostId]);
  const entries: RemoteHostEnvEntry[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Invalid CY_REMOTE_HOSTS[${i}]: entry must be an object`);
    }
    const result = remoteHostBaseSchema.safeParse(item);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path?.[0] !== undefined ? `.${String(issue.path[0])}` : "";
      // Zod's default messages for type errors don't include the received value.
      throw new Error(
        `Invalid CY_REMOTE_HOSTS[${i}]${field}: ${issue?.message ?? "validation failed"}`,
      );
    }
    if (seenIds.has(result.data.id)) {
      throw new Error(`Invalid CY_REMOTE_HOSTS[${i}].id: duplicate host id`);
    }
    seenIds.add(result.data.id);

    const entry: RemoteHostEnvEntry = { ...result.data };
    const rawLogs = (item as Record<string, unknown>).logs;
    if (rawLogs !== undefined) {
      if (!rawLogs || typeof rawLogs !== "object" || Array.isArray(rawLogs)) {
        throw new Error(`Invalid CY_REMOTE_HOSTS[${i}].logs: must be an object`);
      }
      const rawType = (rawLogs as Record<string, unknown>).type;
      if (typeof rawType === "string" && rawType !== "pideck-agent") {
        warn(`[config] CY_REMOTE_HOSTS[${i}].logs: unsupported log provider type; ignoring logs config`);
      } else {
        const logsResult = pideckAgentLogsSchema.safeParse(rawLogs);
        if (!logsResult.success) {
          const issue = logsResult.error.issues[0];
          const field = issue?.path?.[0] !== undefined ? `.${String(issue.path[0])}` : "";
          throw new Error(
            `Invalid CY_REMOTE_HOSTS[${i}].logs${field}: ${issue?.message ?? "validation failed"}`,
          );
        }
        entry.logs = {
          ...logsResult.data,
          url: new URL(logsResult.data.url).origin,
        };
      }
    }

    entries.push(entry);
  }

  return entries;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Ids of remote hosts whose PiDeck agent URL is plain http on a non-loopback
 * address: the agent bearer token travels in clear there unless the link is a
 * private tunnel. Logged as a startup warning (silence with
 * CY_HOSTLOG_ALLOW_HTTP=true once the link is known to be private).
 */
export function plainHttpAgentHosts(entries: RemoteHostEnvEntry[]): string[] {
  return entries
    .filter((entry) => {
      if (!entry.logs) return false;
      try {
        const u = new URL(entry.logs.url);
        return u.protocol === "http:" && !LOOPBACK_HOSTS.has(u.hostname.toLowerCase());
      } catch {
        return false;
      }
    })
    .map((entry) => entry.id);
}
