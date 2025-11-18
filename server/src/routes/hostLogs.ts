import { Router } from "express";
import { spawn } from "child_process";
import { HOST_LOGS } from "../config/hostlogs";
import { requireRole } from "../middleware/auth";
import { dockerClient } from "../services/docker";
import { getHost } from "../config/hosts";

const router = Router();

interface LogQuery {
  tail?: number;
  grep?: string;
}

function parseLogQuery(query: any): LogQuery {
  const tail = query.tail ? parseInt(String(query.tail), 10) : 500;
  const grep = query.grep ? String(query.grep) : undefined;

  return {
    tail: Number.isNaN(tail) ? 500 : Math.min(Math.max(tail, 1), 5000),
    grep,
  };
}

function createGrepFilter(pattern: string | undefined): ((line: string) => boolean) | null {
  if (!pattern) return null;
  const safePattern = pattern.slice(0, 200);
  const lower = safePattern.toLowerCase();
  return (line: string) => line.toLowerCase().includes(lower);
}

async function getLogContent(
  hostId: string,
  logName: string,
  filePath: string,
  options: LogQuery
): Promise<{ content: string[]; available: boolean; reason?: string; details?: any }> {
  const host = getHost(hostId as any);
  if (!host) {
    return { content: [], available: false, reason: "host_not_found" };
  }

  try {
    const d = dockerClient(host.docker!.socketPath);
    // We need a container to exec into. 'cadvisor' is a good candidate as it runs on all hosts.
    const container = d.getContainer("cadvisor");

    const exec = await container.exec({
      Cmd: ["tail", "-n", String(options.tail), filePath],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    
    return new Promise((resolve) => {
      let output = "";
      let errorOutput = "";

      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });

      stream.on('end', () => {
        if (errorOutput) {
          resolve({ content: [], available: false, reason: "exec_error", details: { stderr: errorOutput } });
        } else {
          const lines = output.split('\n').filter(line => line.length > 0);
          resolve({ content: lines, available: true });
        }
      });
    });
  } catch (error: any) {
    return {
      content: [],
      available: false,
      reason: "exec_error",
      details: { stderr: error.message },
    };
  }
}

// List available host logs for a specific host
router.get("/:hostId/logs", (req, res) => {
  const { hostId } = req.params;
  const hostLogs = HOST_LOGS[hostId] || {};
  
  const availableLogs = Object.entries(hostLogs).map(([name, filePath]) => ({
    name,
    path: filePath,
    exists: true, // We can't know for sure without trying to access, so we'll be optimistic
  }));

  res.json({ logs: availableLogs });
});

// Get host log content (snapshot)
router.get("/:hostId/logs/:name", async (req, res, next) => {
  try {
    const { hostId, name } = req.params;
    const hostLogs = HOST_LOGS[hostId] || {};
    const filePath = hostLogs[name];

    if (!filePath) {
      return res.status(404).json({
        error: "Log not found",
        message: `Unknown log name: ${name} for host ${hostId}.`,
      });
    }

    const options = parseLogQuery(req.query);
    const result = await getLogContent(hostId, name, filePath, options);

    if (!result.available) {
      return res.status(200).json({
        available: false,
        reason: result.reason,
        details: result.details,
        logName: name,
        filePath,
      });
    }

    const grepFilter = createGrepFilter(options.grep);
    let filteredLines = result.content;
    if (grepFilter) {
      filteredLines = result.content.filter(grepFilter);
    }

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(filteredLines.join("\n"));
  } catch (error) {
    next(error);
  }
});

export { router as hostLogsRouter };