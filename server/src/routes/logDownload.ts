import { Router, Request, Response, NextFunction } from "express";
import { getHost } from "../config/hosts";
import { getContainerLogs } from "../services/docker";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// Reuse the same allowlist as hostLogs
const HOST_LOG_ALLOWLIST: Record<string, string> = {
  nginx_containerYard_access: '/var/log/nginx/container.piapps.dev.access.log',
  nginx_containerYard_error: '/var/log/nginx/container.piapps.dev.error.log',
  pm2_containeryard_out: path.join(process.env.HOME || '/home/zk', '.pm2/logs/containeryard-out.log'),
  pm2_containeryard_err: path.join(process.env.HOME || '/home/zk', '.pm2/logs/containeryard-error.log'),
  grafana_server: '/var/log/grafana/grafana.log',
  prometheus_server: '/var/log/prometheus/prometheus.log',
  cryptoagent_freqtrade: path.join(process.env.HOME || '/home/zk', 'bots/crypto-agent/user_data/logs/freqtrade.log'),
};

// Middleware to check for admin role
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: "Admin access required for log downloads" });
  }

  next();
}

interface DownloadQuery {
  source: 'container' | 'hostfile';
  hostId?: string;
  containerId?: string;
  name?: string;
  tail?: number;
  since?: string | number;
}

function parseDownloadQuery(query: any): DownloadQuery {
  const source = query.source === 'hostfile' ? 'hostfile' : 'container';
  const tail = query.tail ? parseInt(String(query.tail), 10) : 5000;

  return {
    source,
    hostId: query.hostId ? String(query.hostId) : undefined,
    containerId: query.containerId ? String(query.containerId) : undefined,
    name: query.name ? String(query.name) : undefined,
    tail: Number.isNaN(tail) ? 5000 : Math.min(Math.max(tail, 1), 10000),
    since: query.since ? String(query.since) : undefined,
  };
}

// Download container logs
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const options = parseDownloadQuery(req.query);

    if (options.source === 'container') {
      // Download container logs
      if (!options.hostId || !options.containerId) {
        return res.status(400).json({
          error: "Missing required parameters",
          message: "For container logs, provide: source=container, hostId, containerId"
        });
      }

      const host = getHost(options.hostId);

      if (host.provider !== 'DOCKER') {
        return res.status(400).json({
          error: "Unsupported host",
          message: "Log downloads only supported for Docker hosts"
        });
      }

      const logs = await getContainerLogs(options.containerId, {
        tail: options.tail,
        since: options.since,
        stdout: true,
        stderr: true,
      });

      const filename = `${options.containerId.slice(0, 12)}-${Date.now()}.log`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.send(logs);

    } else if (options.source === 'hostfile') {
      // Download host file logs
      if (!options.name) {
        return res.status(400).json({
          error: "Missing required parameters",
          message: "For host logs, provide: source=hostfile, name"
        });
      }

      const filePath = HOST_LOG_ALLOWLIST[options.name];

      if (!filePath) {
        return res.status(404).json({
          error: "Log not found",
          message: `Unknown log name: ${options.name}`
        });
      }

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

      const filename = `${options.name}-${Date.now()}.log`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Stream the file with tail
      const tail = spawn('tail', ['-n', String(options.tail), filePath]);

      tail.stdout.pipe(res);

      tail.stderr.on('data', (data) => {
        console.error('tail stderr:', data.toString());
      });

      tail.on('error', (err) => {
        console.error('tail error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to read log file" });
        }
      });

      req.on('close', () => {
        tail.kill();
      });

    } else {
      return res.status(400).json({
        error: "Invalid source",
        message: "Source must be 'container' or 'hostfile'"
      });
    }
  } catch (error) {
    next(error);
  }
});

export { router as logDownloadRouter };
