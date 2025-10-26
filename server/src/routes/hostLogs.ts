import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { HOST_LOGS, FALLBACK_DOCKER } from "../config/hostlogs";
import { requireRole } from "../middleware/auth";

const router = Router();

// Use the imported allowlist
const ALLOWLIST: Record<string, string> = HOST_LOGS;

// Use the imported docker fallbacks
const FALLBACK_DOCKER_MAP: Record<string, string> = FALLBACK_DOCKER;

interface LogQuery {
  tail?: number;
  since?: string | number;
  grep?: string;
  timestamps?: boolean;
  follow?: boolean;
}

function parseLogQuery(query: any): LogQuery {
  const tail = query.tail ? parseInt(String(query.tail), 10) : 500;
  const since = query.since ? String(query.since) : undefined;
  const grep = query.grep ? String(query.grep) : undefined;
  const timestamps = query.timestamps === '1' || query.timestamps === 'true';
  const follow = query.follow === '1' || query.follow === 'true';

  return {
    tail: Number.isNaN(tail) ? 500 : Math.min(Math.max(tail, 1), 5000),
    since,
    grep,
    timestamps,
    follow,
  };
}

function createGrepFilter(pattern: string | undefined): ((line: string) => boolean) | null {
  if (!pattern) return null;

  // Limit grep pattern length
  const safePattern = pattern.slice(0, 200);

  // Try to parse as regex if it looks like /pattern/flags
  const regexMatch = safePattern.match(/^\/(.+)\/([gimuy]*)$/);
  if (regexMatch) {
    try {
      const regex = new RegExp(regexMatch[1], regexMatch[2]);
      return (line: string) => regex.test(line);
    } catch {
      // Fall back to substring search
      const lower = safePattern.toLowerCase();
      return (line: string) => line.toLowerCase().includes(lower);
    }
  }

  // Default: case-insensitive substring search
  const lower = safePattern.toLowerCase();
  return (line: string) => line.toLowerCase().includes(lower);
}

async function tailFile(filePath: string, lines: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tail = spawn('tail', ['-n', String(lines), filePath]);
    let output = '';
    let errorOutput = '';

    tail.stdout.on('data', (data) => {
      output += data.toString();
    });

    tail.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    tail.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || `tail exited with code ${code}`));
      } else {
        resolve(output.split('\n').filter(line => line.length > 0));
      }
    });

    tail.on('error', reject);
  });
}

async function dockerLogs(containerName: string, options: LogQuery): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const args = ['logs'];
    
    // Add timestamps if requested
    if (options.timestamps) {
      args.push('--timestamps');
    }
    
    // Add since parameter if provided
    if (options.since) {
      const sinceValue = typeof options.since === 'number' ? `${options.since}s` : options.since;
      args.push('--since', sinceValue);
    }
    
    args.push(containerName);
    
    const docker = spawn('docker', args);
    let output = '';
    let errorOutput = '';

    docker.stdout.on('data', (data) => {
      output += data.toString();
    });

    docker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    docker.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || `docker logs exited with code ${code}`));
      } else {
        const lines = output.split('\n').filter(line => line.length > 0);
        // Limit to requested tail size
        const limitedLines = lines.slice(-Math.min(options.tail || 500, 5000));
        resolve(limitedLines);
      }
    });

    docker.on('error', reject);
  });
}

async function getLogContent(logName: string, filePath: string, options: LogQuery): Promise<{content: string[], available: boolean, reason?: string, details?: any}> {
  // Check if file exists and is readable
  if (!fs.existsSync(filePath)) {
    // Try docker fallback for grafana/prometheus
    if (FALLBACK_DOCKER_MAP[logName]) {
      try {
        const lines = await dockerLogs(FALLBACK_DOCKER_MAP[logName], options);
        return { content: lines, available: true };
      } catch (dockerError: any) {
        if (dockerError.message.includes('No such container')) {
          return { 
            content: [], 
            available: false, 
            reason: 'container_missing',
            details: { containerName: FALLBACK_DOCKER_MAP[logName] }
          };
        }
        return { 
          content: [], 
          available: false, 
          reason: 'exec_error',
          details: { stderr: dockerError.message }
        };
      }
    }
    return { 
      content: [], 
      available: false, 
      reason: 'not_found',
      details: { path: filePath }
    };
  }

  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error: any) {
    if (error.code === 'EACCES') {
      return { 
        content: [], 
        available: false, 
        reason: 'permission',
        details: { path: filePath }
      };
    }
    return { 
      content: [], 
      available: false, 
      reason: 'exec_error',
      details: { stderr: error.message }
    };
  }

  try {
    const lines = await tailFile(filePath, options.tail || 500);
    return { content: lines, available: true };
  } catch (error: any) {
    return { 
      content: [], 
      available: false, 
      reason: 'exec_error',
      details: { stderr: error.message }
    };
  }
}

// Diagnostic endpoint for admin users
router.get("/_diagnose", requireRole("ADMIN"), async (_req, res) => {
  try {
    // Get current user info
    const userInfo = {
      user: process.env.USER || process.env.LOGNAME || "unknown",
      groups: [] as string[],
    };

    // Try to get groups (Linux-specific)
    try {
      const groupsOutput = await new Promise<string>((resolve, reject) => {
        const groups = spawn("groups", []);
        let output = "";
        groups.stdout.on("data", (data) => (output += data.toString()));
        groups.stderr.on("data", (data) => reject(new Error(data.toString())));
        groups.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`groups exited with code ${code}`)));
      });
      userInfo.groups = groupsOutput.trim().split(" ");
    } catch {
      // Ignore errors getting groups
    }

    // Check path existence and permissions
    const pathInfo: Record<string, { path: string; exists: boolean; readable: boolean; size?: number }> = {};
    
    for (const [name, filePath] of Object.entries(ALLOWLIST)) {
      try {
        const exists = fs.existsSync(filePath);
        let readable = false;
        let size: number | undefined;
        
        if (exists) {
          try {
            fs.accessSync(filePath, fs.constants.R_OK);
            readable = true;
            const stats = fs.statSync(filePath);
            size = stats.size;
          } catch {
            readable = false;
          }
        }
        
        pathInfo[name] = { path: filePath, exists, readable, size };
      } catch (error) {
        pathInfo[name] = { path: filePath, exists: false, readable: false };
      }
    }

    // Check docker container existence
    const containerInfo: Record<string, { name: string; exists: boolean }> = {};
    
    for (const [name, containerName] of Object.entries(FALLBACK_DOCKER_MAP)) {
      try {
        const exists = await new Promise<boolean>((resolve) => {
          const docker = spawn("docker", ["inspect", "-f", "{{.Name}}", containerName]);
          let output = "";
          docker.stdout.on("data", (data) => (output += data.toString()));
          docker.on("close", (code) => resolve(code === 0 && output.trim() !== ""));
        });
        containerInfo[name] = { name: containerName, exists };
      } catch {
        containerInfo[name] = { name: containerName, exists: false };
      }
    }

    // Check if user has adm group for nginx logs
    const hasAdmGroup = userInfo.groups.includes("adm");
    const actionHint = !hasAdmGroup ? "add process user to adm group for /var/log" : undefined;

    res.json({
      user: userInfo.user,
      groups: userInfo.groups,
      paths: pathInfo,
      containers: containerInfo,
      actionHint
    });
  } catch (error: any) {
    res.status(500).json({ error: "Diagnostic failed", message: error.message });
  }
});

// List available host logs
router.get("/", (_req, res) => {
  const availableLogs = Object.entries(ALLOWLIST).map(([name, filePath]) => ({
    name,
    path: filePath,
    exists: fs.existsSync(filePath),
  }));

  res.json({ logs: availableLogs });
});

// Get host log content (snapshot or stream)
router.get("/:name", async (req, res, next) => {
  try {
    const logName = req.params.name;
    const filePath = ALLOWLIST[logName];

    if (!filePath) {
      return res.status(404).json({
        error: "Log not found",
        message: `Unknown log name: ${logName}. Use /api/hostlogs to see available logs.`
      });
    }

    const options = parseLogQuery(req.query);
    const grepFilter = createGrepFilter(options.grep);

    if (options.follow) {
      // SSE streaming mode - only for file-based logs (no docker fallback)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Check if file exists and is readable for streaming
      if (!fs.existsSync(filePath)) {
        res.write(`event: error\ndata: Log file not available for streaming: ${filePath}\n\n`);
        res.end();
        return;
      }

      try {
        fs.accessSync(filePath, fs.constants.R_OK);
      } catch {
        res.write(`event: error\ndata: Cannot read log file: ${filePath}\n\n`);
        res.end();
        return;
      }

      // Send initial tail
      try {
        const initialLines = await tailFile(filePath, Math.min(options.tail || 100, 1000));
        for (const line of initialLines) {
          if (line && (!grepFilter || grepFilter(line))) {
            res.write(`event: line\ndata: ${line}\n\n`);
          }
        }
      } catch (error: any) {
        res.write(`event: error\ndata: ${error.message}\n\n`);
      }

      // Follow with tail -f
      const tailFollow = spawn('tail', ['-f', '-n', '0', filePath]);

      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 15000);

      tailFollow.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line && (!grepFilter || grepFilter(line))) {
            res.write(`event: line\ndata: ${line}\n\n`);
          }
        }
      });

      tailFollow.stderr.on('data', (data) => {
        res.write(`event: error\ndata: ${data.toString()}\n\n`);
      });

      const cleanup = () => {
        clearInterval(heartbeat);
        tailFollow.kill();
        res.end();
      };

      req.on('close', cleanup);
      req.on('error', cleanup);
      tailFollow.on('error', (err) => {
        res.write(`event: error\ndata: ${err.message}\n\n`);
        cleanup();
      });
    } else {
      // Snapshot mode with docker fallback
      const result = await getLogContent(logName, filePath, options);
      
      if (!result.available) {
        return res.status(200).json({
          available: false,
          reason: result.reason,
          details: result.details,
          logName,
          filePath,
        });
      }

      let filteredLines = result.content;
      if (grepFilter) {
        filteredLines = result.content.filter(grepFilter);
      }

      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(filteredLines.join('\n'));
    }
  } catch (error) {
    next(error);
  }
});

export { router as hostLogsRouter };