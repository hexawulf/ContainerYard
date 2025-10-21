import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const router = Router();

// Strict allowlist of host log files
const ALLOWLIST: Record<string, string> = {
  nginx_containerYard_access: '/var/log/nginx/container.piapps.dev.access.log',
  nginx_containerYard_error: '/var/log/nginx/container.piapps.dev.error.log',
  pm2_containeryard_out: path.join(process.env.HOME || '/home/zk', '.pm2/logs/containeryard-out.log'),
  pm2_containeryard_err: path.join(process.env.HOME || '/home/zk', '.pm2/logs/containeryard-error.log'),
  grafana_server: '/var/log/grafana/grafana.log',
  prometheus_server: '/var/log/prometheus/prometheus.log',
  cryptoagent_freqtrade: path.join(process.env.HOME || '/home/zk', 'bots/crypto-agent/user_data/logs/freqtrade.log'),
};

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

    // Check if file exists and is readable
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "File not found",
        message: `Log file does not exist: ${filePath}`
      });
    }

    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      return res.status(403).json({
        error: "Access denied",
        message: `Cannot read log file: ${filePath}`
      });
    }

    const options = parseLogQuery(req.query);
    const grepFilter = createGrepFilter(options.grep);

    if (options.follow) {
      // SSE streaming mode
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

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
      // Snapshot mode
      const lines = await tailFile(filePath, options.tail || 500);

      let filteredLines = lines;
      if (grepFilter) {
        filteredLines = lines.filter(grepFilter);
      }

      res.json({
        content: filteredLines.join('\n'),
        truncated: lines.length >= (options.tail || 500),
        logName,
        filePath,
      });
    }
  } catch (error) {
    next(error);
  }
});

export { router as hostLogsRouter };
