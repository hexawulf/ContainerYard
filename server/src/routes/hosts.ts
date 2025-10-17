import { Router } from "express";
import { getHost, getDozzleLink, listHosts } from "../config/hosts";
import { listContainers as listDockerContainers, getContainerDetail as getDockerContainerDetail, getContainerLogs, getContainerStats as getDockerContainerStats } from "../services/docker";
import { getCadvisorService } from "../services/cadvisor";

const router = Router();

router.get("/", (_req, res) => {
  res.json(listHosts());
});

router.get("/:hostId/containers", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);

    if (host.provider === "DOCKER") {
      const containers = await listDockerContainers(host);
      return res.json(containers);
    }

    const service = getCadvisorService(host);
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

    if (host.provider === "DOCKER") {
      const stats = await getDockerContainerStats(host, containerId);
      return res.json(stats);
    }

    const service = getCadvisorService(host);
    const stats = await service.getStats(host, containerId);
    return res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/:hostId/containers/:containerId/logs", async (req, res, next) => {
  try {
    const host = getHost(req.params.hostId);
    const tail = req.query.tail ? parseInt(String(req.query.tail), 10) : 500;

    if (host.provider === "DOCKER") {
      const logs = await getContainerLogs(req.params.containerId, Number.isNaN(tail) ? 500 : tail);
      res.type("text/plain");
      return res.send(logs);
    }

    const link = getDozzleLink(host.id);
    if (!link) {
      return res.status(404).json({ message: "Logs not available for this host" });
    }

    return res.json({ link });
  } catch (error) {
    next(error);
  }
});

export { router as hostsRouter };
