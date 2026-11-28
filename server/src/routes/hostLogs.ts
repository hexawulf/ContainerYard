/**
 * Host logs routes (local files, local self-container `cy_app`, and remote
 * read-only PiDeck agents).
 *
 *   GET /api/hosts/:hostId/logs                    list sources
 *   GET /api/hosts/:hostId/logs/:name?tail=&grep=  snapshot, text/plain
 *   GET /api/hosts/:hostId/logs/:name?follow=1     live tail, text/event-stream ("line" / "gap" events)
 *
 * ADMIN only on every route. Snapshot reads write an audit record; follow polls do not.
 */
import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import readline from "readline";
import { isReadableAsync } from "../config/hostlogs";
import { requireRole } from "../middleware/auth";
import { acquireSseStreamSlot, isSseSessionValid } from "../lib/sseGuard";
import { recordAudit } from "../services/audit";
import { streamContainerLogs } from "../services/docker";
import {
  getProvider as defaultGetProvider,
  HostLogSourceError,
  REMOTE_SOURCE_ID_RE,
  type HostLogProvider,
} from "../services/hostLogs";

const REMOTE_POLL_LINES = 200;
const ANCHOR_LINES = 20;
const DEFAULT_REMOTE_POLL_MS = 3_000;
const DEFAULT_HEARTBEAT_MS = 15_000;

interface LogQuery {
  tail: number;
  grep?: string;
}

function parseLogQuery(query: Request["query"]): LogQuery {
  const tail = query.tail ? parseInt(String(query.tail), 10) : 500;
  const grep = query.grep ? String(query.grep).slice(0, 200) : undefined;
  return {
    tail: Number.isNaN(tail) ? 500 : Math.min(Math.max(tail, 1), 5000),
    grep,
  };
}

function grepFilter(pattern: string | undefined): (line: string) => boolean {
  if (!pattern) return () => true;
  const lower = pattern.toLowerCase();
  return (line) => line.toLowerCase().includes(lower);
}

function unavailable(res: Response, logName: string, reason: string, message: string) {
  return res.status(200).json({ available: false, reason, message, logName });
}

function sanitizeSseLine(line: string): string {
  return line.replace(/[\r\n]+/g, " ");
}

function arraysEqualSlice(a: string[], aStart: number, b: string[], bStart: number, len: number): boolean {
  for (let i = 0; i < len; i++) {
    if (a[aStart + i] !== b[bStart + i]) return false;
  }
  return true;
}

/**
 * Diff a polled remote log batch against the previous 20-line overlap anchor.
 * Returns only newly arrived lines, or signals a gap when the anchor was pushed
 * completely out of the polled window.
 */
export function diffPollLines(
  anchor: string[],
  batch: string[],
): { gap: boolean; newLines: string[]; nextAnchor: string[] } {
  if (anchor.length === 0) {
    return {
      gap: false,
      newLines: batch,
      nextAnchor: batch.slice(-ANCHOR_LINES),
    };
  }
  if (batch.length === 0) {
    return { gap: false, newLines: [], nextAnchor: anchor };
  }

  const k = anchor.length;
  // 1. Search backwards for the rightmost full match of the anchor inside batch.
  if (batch.length >= k) {
    for (let i = batch.length - k; i >= 0; i--) {
      if (arraysEqualSlice(batch, i, anchor, 0, k)) {
        const newLines = batch.slice(i + k);
        const nextAnchor = newLines.length > 0 ? [...anchor, ...newLines].slice(-ANCHOR_LINES) : anchor;
        return { gap: false, newLines, nextAnchor };
      }
    }
  }

  // 2. Partial overlap at the top of batch (older lines of anchor rolled off the 200-line window).
  const minOverlap = Math.min(3, k);
  const maxOverlap = Math.min(k - 1, batch.length);
  for (let overlap = maxOverlap; overlap >= minOverlap; overlap--) {
    if (arraysEqualSlice(batch, 0, anchor, k - overlap, overlap)) {
      const newLines = batch.slice(overlap);
      const nextAnchor = newLines.length > 0 ? [...anchor, ...newLines].slice(-ANCHOR_LINES) : anchor;
      return { gap: false, newLines, nextAnchor };
    }
  }

  // 3. No overlap found: emit gap and reset anchor to the new batch tail.
  return {
    gap: true,
    newLines: batch,
    nextAnchor: batch.slice(-ANCHOR_LINES),
  };
}

export interface HostLogsRouterOptions {
  getProvider?: (hostId: string) => HostLogProvider | null;
  remotePollMs?: number;
  heartbeatMs?: number;
  /** Optional hook for unit tests to verify session validity without Redis/Prisma. */
  isSessionValid?: (req: Request) => Promise<boolean>;
}

export function createHostLogsRouter(opts: HostLogsRouterOptions = {}): Router {
  const router = Router();
  const resolveProvider = opts.getProvider ?? defaultGetProvider;
  const remotePollMs = opts.remotePollMs ?? DEFAULT_REMOTE_POLL_MS;
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const checkSseSession =
    opts.isSessionValid ?? ((req: Request) => isSseSessionValid(req, { requireRole: "ADMIN" }));

  // Per-route (not router.use): this router shares the /api/hosts mount with others.
  const adminOnly = requireRole("ADMIN");

  router.get("/:hostId/logs", adminOnly, async (req, res, next) => {
    try {
      const hostId = String(req.params.hostId);
      const provider = resolveProvider(hostId);
      if (!provider) {
        return res.json({
          logs: [],
          message: "No log source is configured for this host.",
        });
      }

      const result = await provider.list();
      if (result.error) {
        return res.json({
          logs: [],
          available: false,
          reason: result.error.reason,
          message: result.error.message,
        });
      }

      const logs = result.sources.map((s) => ({
        name: s.name,
        title: s.title,
        kind: s.kind,
        ...(s.path ? { path: s.path } : {}),
        exists: s.available,
        ...(s.hint ? { hint: s.hint } : {}),
        ...(s.size !== undefined ? { size: s.size } : {}),
        ...(s.mtime ? { mtime: s.mtime } : {}),
      }));

      res.json({
        logs,
        ...(logs.length === 0
          ? { message: result.message ?? "No log source is configured for this host." }
          : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:hostId/logs/:name", adminOnly, async (req, res, next) => {
    const hostId = String(req.params.hostId);
    const name = String(req.params.name);
    const provider = resolveProvider(hostId);
    if (!provider) {
      return res.status(404).json({
        error: "Log not found",
        message: `No log source is configured for host ${hostId}.`,
      });
    }

    const options = parseLogQuery(req.query);
    const keep = grepFilter(options.grep);
    // A repeated ?follow=1&follow=1 arrives as an array; accept any truthy value.
    const follow = ([] as unknown[])
      .concat(req.query.follow ?? [])
      .some((v) => v === "1" || v === "true");

    if (!follow) {
      try {
        const result = await provider.tail(name, { lines: options.tail, grep: options.grep });
        void recordAudit(req, {
          action: "hostlogs.read",
          outcome: "success",
          hostId,
          target: `${hostId}/${name}`,
        });
        res.set("Content-Type", "text/plain; charset=utf-8");
        if (result.truncated) {
          res.set("X-CY-Log-Truncated", "true");
        }
        if (result.redacted && result.redacted > 0) {
          res.set("X-CY-Log-Redacted", String(result.redacted));
        }
        res.send(result.lines.join("\n"));
      } catch (error) {
        if (error instanceof HostLogSourceError) {
          if (error.status === 404 || error.status === 400) {
            return res.status(error.status).json({ error: "Log not found", message: error.message });
          }
          return unavailable(res, name, error.reason, error.message);
        }
        next(error);
      }
      return;
    }

    // Live tail via Server-Sent Events
    try {
      // 1. Local file: unchanged `tail -F`
      const localFile = provider.resolveLocalFile ? await provider.resolveLocalFile(name) : null;
      if (provider.type === "local" && localFile !== null) {
        if (!(await isReadableAsync(localFile))) {
          return unavailable(res, name, "not_readable", `Log file is missing or not readable: ${localFile}`);
        }
        const userKey = req.session?.user?.id || req.ip || "anon";
        const releaseSlot = acquireSseStreamSlot(userKey);
        if (!releaseSlot) {
          return res.status(429).json({ message: "Too many concurrent log streams" });
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const child = spawn("tail", ["-n", String(Math.min(options.tail, 500)), "-F", "--", localFile]);
        let closed = false;
        const closeStream = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          releaseSlot();
          child.kill("SIGTERM");
          if (!res.writableEnded) {
            res.end();
          }
        };
        const lines = readline.createInterface({ input: child.stdout });
        lines.on("line", (line) => {
          if (line && keep(line) && !res.writableEnded) {
            res.write(`event: line\ndata: ${sanitizeSseLine(line)}\n\n`);
          }
        });
        child.on("error", (err) => {
          if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
          }
          closeStream();
        });
        child.on("exit", () => {
          closeStream();
        });
        const heartbeat = setInterval(() => {
          void checkSseSession(req).then((valid) => {
            if (!valid) {
              closeStream();
              return;
            }
            if (!res.writableEnded) res.write(":heartbeat\n\n");
          });
        }, heartbeatMs);
        req.on("close", closeStream);
        return;
      }

      // 2. Local Docker self-container (`cy_app`)
      const dockerTarget = provider.resolveLocalDockerContainer
        ? await provider.resolveLocalDockerContainer(name)
        : null;
      if (provider.type === "local" && dockerTarget) {
        const userKey = req.session?.user?.id || req.ip || "anon";
        const releaseSlot = acquireSseStreamSlot(userKey);
        if (!releaseSlot) {
          return res.status(429).json({ message: "Too many concurrent log streams" });
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        let closed = false;
        let stopDockerStream: (() => void) | null = null;
        const closeStream = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          releaseSlot();
          stopDockerStream?.();
          if (!res.writableEnded) {
            res.end();
          }
        };

        const heartbeat = setInterval(() => {
          void checkSseSession(req).then((valid) => {
            if (!valid) {
              closeStream();
              return;
            }
            if (!res.writableEnded) res.write(":heartbeat\n\n");
          });
        }, heartbeatMs);
        req.on("close", closeStream);

        try {
          stopDockerStream = await streamContainerLogs(
            {
              id: hostId,
              name: hostId,
              provider: "DOCKER",
              nodeLabel: hostId,
              docker: { socketPath: dockerTarget.socketPath },
            },
            dockerTarget.containerId,
            { tail: Math.min(options.tail, 500), grep: options.grep, stdout: true, stderr: true },
            (line) => {
              if (!closed && !res.writableEnded) {
                res.write(`event: line\ndata: ${sanitizeSseLine(line)}\n\n`);
              }
            },
            (err) => {
              if (!closed && !res.writableEnded) {
                res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
              }
              closeStream();
            },
          );
          if (closed) {
            stopDockerStream();
          }
        } catch (err) {
          if (!closed && !res.writableEnded) {
            const msg = err instanceof Error ? err.message : "Stream error";
            res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
          }
          closeStream();
        }
        return;
      }

      if (provider.type === "local") {
        return res.status(404).json({
          error: "Log not found",
          message: `Unknown log name: ${name} for host ${hostId}.`,
        });
      }

      // 3. Remote PiDeck agent: poll every 3s with 20-line overlap anchor
      if (!REMOTE_SOURCE_ID_RE.test(name)) {
        return res.status(400).json({ error: "Invalid log source", message: "Invalid log source name." });
      }

      const userKey = req.session?.user?.id || req.ip || "anon";
      const releaseSlot = acquireSseStreamSlot(userKey);
      if (!releaseSlot) {
        return res.status(429).json({ message: "Too many concurrent log streams" });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let anchor: string[] = [];
      let pollTimer: ReturnType<typeof setTimeout> | null = null;

      const closeStream = () => {
        if (closed) return;
        closed = true;
        if (pollTimer !== null) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        clearInterval(heartbeat);
        releaseSlot();
        if (!res.writableEnded) {
          res.end();
        }
      };

      const heartbeat = setInterval(() => {
        void checkSseSession(req).then((valid) => {
          if (!valid) {
            closeStream();
            return;
          }
          if (!res.writableEnded) res.write(":heartbeat\n\n");
        });
      }, heartbeatMs);

      req.on("close", closeStream);

      const scheduleNext = () => {
        if (closed) return;
        pollTimer = setTimeout(() => {
          pollTimer = null;
          void runPoll();
        }, remotePollMs);
      };

      const runPoll = async () => {
        if (closed) return;
        try {
          const result = await provider.tail(name, {
            lines: REMOTE_POLL_LINES,
            grep: options.grep,
          });
          if (closed || res.writableEnded) return;
          const isFirstPoll = anchor.length === 0;
          const diff = diffPollLines(anchor, result.lines);
          anchor = diff.nextAnchor;
          const { gap } = diff;
          // The first poll fetches REMOTE_POLL_LINES to seed the anchor; send
          // only the last ?tail= lines of it, like the local `tail -n N -F`.
          const newLines = isFirstPoll ? diff.newLines.slice(-Math.min(options.tail, 500)) : diff.newLines;
          if (gap) {
            res.write(
              `event: gap\ndata: ${JSON.stringify({ message: "Some log lines were skipped between polls" })}\n\n`,
            );
          }
          for (const line of newLines) {
            if (closed || res.writableEnded) break;
            res.write(`event: line\ndata: ${sanitizeSseLine(line)}\n\n`);
          }
          scheduleNext();
        } catch (err) {
          if (!closed && !res.writableEnded) {
            const msg = err instanceof HostLogSourceError ? err.message : "Failed to poll remote log agent";
            const reason = err instanceof HostLogSourceError ? err.reason : "agent_unreachable";
            res.write(`event: error\ndata: ${JSON.stringify({ message: msg, reason })}\n\n`);
          }
          closeStream();
        }
      };

      void runPoll();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const hostLogsRouter = createHostLogsRouter();
