/**
 * Typed errors with an HTTP status, and a safe way to read fields from an
 * unknown caught value. Replaces the old `(err as any).status = 404` pattern.
 *
 * Property names (status, code, hostId, originalError, expose) are the ones
 * the error handler in server/src/index.ts and the routes already read, so
 * throwing an HttpError behaves exactly like the old decorated Error.
 */

export interface HttpErrorOptions {
  code?: string;
  hostId?: string;
  originalError?: string;
  expose?: boolean;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly hostId?: string;
  readonly originalError?: string;
  readonly expose?: boolean;

  constructor(message: string, status: number, options: HttpErrorOptions = {}) {
    super(message);
    this.status = status;
    if (options.code !== undefined) this.code = options.code;
    if (options.hostId !== undefined) this.hostId = options.hostId;
    if (options.originalError !== undefined) this.originalError = options.originalError;
    if (options.expose !== undefined) this.expose = options.expose;
  }
}

/** The fields ContainerYard reads from errors thrown by dockerode, fetch, Node, Prisma or itself. */
export interface ErrorInfo {
  message: string;
  name?: string;
  /** Our own HTTP status (HttpError, http-errors). */
  status?: number;
  /** Upstream HTTP status (dockerode / docker-modem). */
  statusCode?: number;
  /** Node errno code (EACCES, ECONNREFUSED…), Prisma code (P2002) or our own code. */
  code?: string;
  /** docker-modem's short reason text. */
  reason?: string;
  /** docker-modem's parsed JSON body message. */
  jsonMessage?: string;
  expose?: boolean;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Read the known fields of a caught value without trusting its shape. */
export function errorInfo(err: unknown): ErrorInfo {
  // A thrown primitive becomes its text; an object without a string message
  // gives "" so callers' `message || "fallback"` still picks the fallback.
  if (typeof err !== "object" || err === null) return { message: err === undefined || err === null ? "" : String(err) };
  const e = err as Record<string, unknown>;
  const json = e.json;
  return {
    message: asString(e.message) ?? "",
    name: asString(e.name),
    status: asNumber(e.status),
    statusCode: asNumber(e.statusCode),
    code: asString(e.code),
    reason: asString(e.reason),
    jsonMessage:
      typeof json === "object" && json !== null
        ? asString((json as Record<string, unknown>).message)
        : undefined,
    expose: e.expose === true ? true : undefined,
  };
}

/** Message of a caught value (Error or anything else). */
export function errorMessage(err: unknown): string {
  return errorInfo(err).message;
}
