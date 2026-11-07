/**
 * Host log files (nginx, pm2) for the host ContainerYard runs on.
 *
 *   GET /api/hosts/:hostId/logs                    list (with real "exists" flags)
 *   GET /api/hosts/:hostId/logs/:name?tail=&grep=  snapshot, text/plain
 *   GET /api/hosts/:hostId/logs/:name?follow=1     live tail, text/event-stream ("line" events)
 *
 * Only names from the server-side allowlist (config/hostlogs.ts) can be read;
 * the client never supplies a path.
 */
import { Router, type Response } from "express";
import { execFile, spawn } from "child_process";
import readline from "readline";
import { LOCAL_HOST_ID, isReadable, resolveHostLogs } from "../config/hostlogs";

const router = Router();

interface LogQuery {
  tail: number;
  grep?: string;
}

function parseLogQuery(query: any): LogQuery {
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

router.get("/:hostId/logs", (req, res) => {
  const { hostId } = req.params;
  const logs = Object.entries(resolveHostLogs(hostId)).map(([name, filePath]) => ({
    name,
    path: filePath,
    exists: isReadable(filePath),
  }));
  res.json({
    logs,
    ...(logs.length === 0
      ? { message: `Host logs are only available for ${LOCAL_HOST_ID}, the host ContainerYard runs on.` }
      : {}),
  });
});

router.get("/:hostId/logs/:name", (req, res, next) => {
  const { hostId, name } = req.params;
  const filePath = resolveHostLogs(hostId)[name];
  if (!filePath) {
    return res.status(404).json({ error: "Log not found", message: `Unknown log name: ${name} for host ${hostId}.` });
  }
  if (!isReadable(filePath)) {
    return unavailable(res, name, "not_readable", `Log file is missing or not readable: ${filePath}`);
  }

  const options = parseLogQuery(req.query);
  const keep = grepFilter(options.grep);
  // A repeated ?follow=1&follow=1 arrives as an array; accept any truthy value.
  const follow = ([] as unknown[]).concat(req.query.follow ?? []).some((v) => v === "1" || v === "true");

  if (!follow) {
    execFile(
      "tail",
      ["-n", String(options.tail), "--", filePath],
      { maxBuffer: 32 * 1024 * 1024, timeout: 15_000, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          return unavailable(res, name, "read_error", error.message);
        }
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.send(stdout.split("\n").filter((l) => l.length > 0 && keep(l)).join("\n"));
      },
    );
    return;
  }

  // Live tail via Server-Sent Events. -F keeps following across log rotation.
  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const child = spawn("tail", ["-n", String(Math.min(options.tail, 500)), "-F", "--", filePath]);
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (line && keep(line) && !res.writableEnded) {
        // SSE data must not contain raw newlines; tail lines never do.
        res.write(`event: line\ndata: ${line}\n\n`);
      }
    });
    child.on("error", (err) => {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        res.end();
      }
    });
    child.on("exit", () => {
      if (!res.writableEnded) res.end();
    });
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(":heartbeat\n\n");
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      child.kill("SIGTERM");
    });
  } catch (error) {
    next(error);
  }
});

export { router as hostLogsRouter };
