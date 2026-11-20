/**
 * Read-only PiDeck agent log provider.
 *
 * Talks to a configured PiDeck agent (`GET /api/agent/logs`, `GET /api/agent/logs/:id`)
 * with strict origin locking, no redirects, 2 MB response cap, 15 s list cache, and
 * 3-strike auth backoff so ContainerYard never triggers agent rate-limits.
 *
 * Security invariants:
 * - Source ids are validated against `REMOTE_SOURCE_ID_RE` before any HTTP call.
 * - Bearer tokens and raw agent response bodies are NEVER echoed in errors or logs.
 * - Agent `file` paths (if present) are never exposed in `HostLogSource`.
 */
import type { RemoteHostLogsConfig } from "../../config/remoteHosts";
import { TtlCache } from "../../lib/ttlCache";
import {
  HostLogSourceError,
  REMOTE_SOURCE_ID_RE,
  type HostLogKind,
  type HostLogListResult,
  type HostLogProvider,
  type HostLogProviderErrorReason,
  type HostLogSource,
  type HostLogTailOptions,
  type HostLogTailResult,
} from "./types";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_AGENT_LINES = 2000;
const MAX_FILTER_CHARS = 200;
const DEFAULT_LIST_TTL_MS = 15_000;
const DEFAULT_AUTH_BACKOFF_MS = 5 * 60_000;
const AUTH_FAILURE_THRESHOLD = 3;

const REASON_MESSAGES: Record<HostLogProviderErrorReason, string> = {
  agent_unreachable: "Can't reach the log agent on this host",
  agent_auth: "The log agent rejected ContainerYard's token",
  agent_logs_off: "Logs are off on this host's agent",
  agent_rate_limited: "The log agent rate-limited requests; try again shortly",
  agent_error: "The log agent returned an unexpected response",
};

interface AgentSourceInfo {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  readable?: unknown;
  hint?: unknown;
  size?: unknown;
  mtime?: unknown;
}

interface AgentListPayload {
  sources?: unknown;
}

interface AgentTailPayload {
  lines?: unknown;
  truncated?: unknown;
  redacted?: unknown;
}

class AgentFetchError extends Error {
  constructor(
    public readonly reason: HostLogProviderErrorReason,
    public readonly status = 200,
    message?: string,
  ) {
    super(message ?? REASON_MESSAGES[reason]);
    this.name = "AgentFetchError";
  }
}

export interface PideckAgentProviderOptions {
  hostId: string;
  config: RemoteHostLogsConfig;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  listTtlMs?: number;
  authBackoffMs?: number;
}

function isValidKind(k: unknown): k is HostLogKind {
  return k === "file" || k === "journal" || k === "docker" || k === "pm2";
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw new AgentFetchError("agent_error", 200);
    }
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AgentFetchError("agent_error", 200);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

export function createPideckAgentProvider(opts: PideckAgentProviderOptions): HostLogProvider {
  const baseOrigin = new URL(opts.config.url).origin;
  const timeoutMs = opts.config.timeoutMs ?? 5000;
  const getEnv = () => opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const listTtlMs = opts.listTtlMs ?? DEFAULT_LIST_TTL_MS;
  const authBackoffMs = opts.authBackoffMs ?? DEFAULT_AUTH_BACKOFF_MS;

  const listCache = new TtlCache({ ttlMs: listTtlMs, staleMs: listTtlMs, now });

  let consecutiveAuthFailures = 0;
  let authBackoffUntil = 0;

  function getToken(): string | null {
    const raw = getEnv()[opts.config.tokenEnv];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  }

  function assertNotBackedOff(): void {
    if (authBackoffUntil > 0 && now() < authBackoffUntil) {
      throw new AgentFetchError("agent_auth", 200);
    }
  }

  function recordAuthFailure(): void {
    consecutiveAuthFailures += 1;
    if (consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
      authBackoffUntil = now() + authBackoffMs;
    }
  }

  function recordSuccess(): void {
    consecutiveAuthFailures = 0;
    authBackoffUntil = 0;
  }

  async function requestJson<T>(relPath: string, context: "list" | "tail", sourceId?: string): Promise<T> {
    assertNotBackedOff();

    const token = getToken();
    if (!token) {
      throw new AgentFetchError("agent_auth", 200, "Log agent token is not configured");
    }

    const fullUrl = new URL(relPath, baseOrigin);
    if (fullUrl.origin !== baseOrigin) {
      throw new AgentFetchError("agent_error", 200);
    }

    let res: Response;
    try {
      res = await fetch(fullUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AgentFetchError("agent_unreachable", 200);
    }

    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => undefined);
      recordAuthFailure();
      throw new AgentFetchError("agent_auth", 200);
    }
    if (res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      throw new AgentFetchError("agent_rate_limited", 200);
    }
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      if (context === "list") {
        throw new AgentFetchError("agent_logs_off", 200);
      }
      throw new HostLogSourceError(
        404,
        "not_found",
        `Unknown log name: ${sourceId ?? ""} for host ${opts.hostId}.`,
      );
    }
    if (res.status === 409 && context === "tail") {
      await res.body?.cancel().catch(() => undefined);
      throw new HostLogSourceError(200, "not_readable", "Log source is not readable on this host.");
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AgentFetchError("agent_error", 200);
    }

    recordSuccess();

    const text = await readBoundedText(res, MAX_RESPONSE_BYTES);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AgentFetchError("agent_error", 200);
    }
  }

  return {
    type: "pideck-agent",

    async list(): Promise<HostLogListResult> {
      try {
        const sources = await listCache.get<HostLogSource[]>(`list:${opts.hostId}`, async () => {
          const payload = await requestJson<AgentListPayload>("/api/agent/logs", "list");
          if (!payload || !Array.isArray(payload.sources)) {
            throw new AgentFetchError("agent_error", 200);
          }
          const mapped: HostLogSource[] = [];
          for (const raw of payload.sources) {
            if (!raw || typeof raw !== "object") continue;
            const s = raw as AgentSourceInfo;
            if (typeof s.id !== "string" || !REMOTE_SOURCE_ID_RE.test(s.id)) continue;
            const kind: HostLogKind = isValidKind(s.kind) ? s.kind : "file";
            const title = typeof s.label === "string" && s.label.trim() ? s.label : s.id;
            const source: HostLogSource = {
              name: s.id,
              title,
              kind,
              available: Boolean(s.readable),
              ...(typeof s.hint === "string" && s.hint ? { hint: s.hint } : {}),
              ...(typeof s.size === "number" ? { size: s.size } : {}),
              ...(typeof s.mtime === "string" && s.mtime ? { mtime: s.mtime } : {}),
            };
            mapped.push(source);
          }
          return mapped;
        });
        return { sources };
      } catch (err) {
        if (err instanceof AgentFetchError) {
          return {
            sources: [],
            error: { reason: err.reason, message: err.message },
          };
        }
        return {
          sources: [],
          error: { reason: "agent_unreachable", message: REASON_MESSAGES.agent_unreachable },
        };
      }
    },

    async tail(name: string, options: HostLogTailOptions): Promise<HostLogTailResult> {
      if (!REMOTE_SOURCE_ID_RE.test(name)) {
        throw new HostLogSourceError(400, "invalid_source", "Invalid log source name.");
      }

      const clampedLines = Math.min(Math.max(Math.floor(options.lines || 200), 1), MAX_AGENT_LINES);
      const params = new URLSearchParams();
      params.set("lines", String(clampedLines));
      if (options.grep && options.grep.length > 0) {
        params.set("filter", options.grep.slice(0, MAX_FILTER_CHARS));
      }

      try {
        const payload = await requestJson<AgentTailPayload>(
          `/api/agent/logs/${name}?${params.toString()}`,
          "tail",
          name,
        );
        if (!payload || !Array.isArray(payload.lines)) {
          throw new HostLogSourceError(200, "agent_error", REASON_MESSAGES.agent_error);
        }
        const lines = payload.lines.filter((l): l is string => typeof l === "string");
        return {
          lines,
          truncated: Boolean(payload.truncated),
          redacted: typeof payload.redacted === "number" && payload.redacted > 0 ? payload.redacted : 0,
        };
      } catch (err) {
        if (err instanceof HostLogSourceError) throw err;
        if (err instanceof AgentFetchError) {
          throw new HostLogSourceError(err.status, err.reason, err.message);
        }
        throw new HostLogSourceError(200, "agent_unreachable", REASON_MESSAGES.agent_unreachable);
      }
    },
  };
}
