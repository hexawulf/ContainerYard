import { Router } from "express";
import { getHost, getDozzleLink, listHosts } from "../config/hosts";
import { 
  listContainers as listDockerContainers, 
  getContainerDetail as getDockerContainerDetail, 
  getContainerLogs, 
  getContainerStats as getDockerContainerStats,
  streamContainerLogs,
  type LogOptions 
} from "../services/docker";
import { getDockerHostStats } from "../services/dockerHostStats";
import { getCadvisorService } from "../services/cadvisor";
import type { ContainerLogsResponse, NormalizedStats, HostStats } from "@shared/monitoring";

const router = Router();

router.get("/", (_req, res) => {
  // Always return hosts array, even for unauthenticated requests
  // This allows the UI to show available hosts before authentication
  res.json(listHosts());
});

router.get("/:hostId/stats", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);

    if (host.provider !== "DOCKER") {
      return res.json({
        id: host.id,
        hostId: host.id,
        provider: host.provider,
        cpuPercent: 0,
        memoryUsage: 0,
        memoryLimit: 0,
        memoryPercent: 0,
        networkRx: 0,
        networkTx: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date().toISOString(),
      } satisfies HostStats);
    }

    const stats = await getDockerHostStats(host);
    return res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);

    if (host.provider === "DOCKER") {
      const containers = await listDockerContainers(host);
      return res.json(containers);
    }

    const service = getCadvisorService(host);
    if (!service) {
      return res.status(503).json({ error: "cAdvisor service unavailable for this host" });
    }
    const containers = await service.listContainers(host);
    return res.json(containers);
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers/:containerId", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);
    const containerId = req.params.containerId;

    if (host.provider === "DOCKER") {
      const container = await getDockerContainerDetail(host, containerId);
      return res.json(container);
    }

    const service = getCadvisorService(host);
    if (!service) {
      return res.status(503).json({ error: "cAdvisor service unavailable for this host" });
    }
    const container = await service.getContainer(host, containerId);
    return res.json(container);
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers/:containerId/stats", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);
    const containerId = req.params.containerId;

    let stats;
    if (host.provider === "DOCKER") {
      stats = await getDockerContainerStats(host, containerId);
    } else {
      const service = getCadvisorService(host);
      if (!service) {
        return res.status(503).json({ error: "cAdvisor service unavailable for this host" });
      }
      stats = await service.getStats(host, containerId);
    }

    // Normalize all stats to numbers (never null/undefined)
    const normalized: NormalizedStats = {
      cpuPct: Number(stats.cpuPercent || 0),
      memPct: Number(stats.memoryPercent || 0),
      memBytes: Number(stats.memoryUsage || 0),
      blkRead: Number(stats.blockRead || 0),
      blkWrite: Number(stats.blockWrite || 0),
      netRx: Number(stats.networkRx || 0),
      netTx: Number(stats.networkTx || 0),
      ts: stats.timestamp || new Date().toISOString(),
    };

    return res.json(normalized);
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers/:containerId/logs", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);
    const containerId = req.params.containerId;

    if (host.provider === "DOCKER") {
      const tail = req.query.tail ? parseInt(String(req.query.tail), 10) : 500;
      const since = req.query.since ? String(req.query.since) : undefined;
      const grep = req.query.grep ? String(req.query.grep) : undefined;
      const stdout = req.query.stdout !== 'false';
      const stderr = req.query.stderr !== 'false';

      const options: LogOptions = {
        tail: Number.isNaN(tail) ? 500 : Math.min(tail, 5000),
        since: since && !isNaN(Number(since)) ? Number(since) : since,
        grep,
        stdout,
        stderr,
      };

      const logs = await getContainerLogs(containerId, options);
      const response: ContainerLogsResponse = {
        content: logs,
        truncated: options.tail === 5000,
      };
      return res.json(response);
    }

    const dozzleUrl = getDozzleLink(host.id);
    if (!dozzleUrl) {
      return res.status(404).json({ message: "Logs not available for this host" });
    }

    const link = `${dozzleUrl}/#/container/${containerId}`;
    return res.status(501).json({ link });
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers/:containerId/logs/stream", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);
    const containerId = req.params.containerId;

    if (host.provider !== "DOCKER") {
      return res.status(501).json({ message: "SSE streaming only supported for Docker hosts" });
    }

    const stdout = req.query.stdout !== 'false';
    const stderr = req.query.stderr !== 'false';
    const grep = req.query.grep ? String(req.query.grep) : undefined;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 15000);

    const cleanup = await streamContainerLogs(
      containerId,
      { stdout, stderr, grep },
      (line) => {
        res.write(`event: line\ndata: ${line}\n\n`);
      },
      (err) => {
        res.write(`event: error\ndata: ${err.message}\n\n`);
        res.end();
      }
    );

    req.on('close', () => {
      clearInterval(heartbeat);
      cleanup();
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

export { router as hostsRouter };
