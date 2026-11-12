import { Router } from "express";
import { getHost } from "../config/hosts";
import { dockerClient } from "../services/docker";
import { isDockerContainerPath } from "../services/cadvisor";
import { requireAuth } from "../middleware/auth";

const r = Router();

const CADVISOR_TIMEOUT_MS = 10_000;

/**
 * GET /api/hosts/:hostId/containers/:id/inspect
 * - DOCKER: returns dockerode inspect JSON (admins only: it contains the
 *   container's environment, command line and mounts)
 * - CADVISOR_ONLY: returns a reduced spec via cAdvisor (image, name, labels, resources)
 */
r.get("/api/hosts/:hostId/containers/:id/inspect", requireAuth, async (req, res) => {
  try {
    const { hostId, id } = req.params;
    const host = getHost(hostId); // throws with status 404 for an unknown host

    if (host.provider === "DOCKER") {
      if (req.session.user?.role !== "ADMIN") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      if (!host.docker?.socketPath) {
        return res.status(500).json({ error: "Docker socket path not configured for this host" });
      }
      const d = dockerClient(host.docker.socketPath);
      const info = await d.getContainer(id).inspect();
      return res.json(info);
    } else {
      if (!host.cadvisor?.baseUrl) {
        return res.status(500).json({ error: "cAdvisor URL not configured for this host" });
      }
      // cAdvisor ids are cgroup paths (/docker/<id>, /system.slice/docker-<id>.scope).
      // Anything else is refused, so the id cannot be used to reach other
      // paths on the cAdvisor host.
      if (!isDockerContainerPath(id)) {
        return res.status(404).json({ error: "not_found" });
      }
      const base = host.cadvisor.baseUrl.replace(/\/+$/, "");
      const resp = await fetch(`${base}/api/v1.3/containers${id}`, {
        signal: AbortSignal.timeout(CADVISOR_TIMEOUT_MS),
      });
      if (!resp.ok) return res.status(404).json({ error: "not_found" });
      const data: any = await resp.json();
      const last = data?.stats?.[data.stats.length - 1];
      const spec = {
        id: data?.id || id,
        name: (data?.aliases?.[0] || data?.name || "").replace(/^\/?docker\//, "").replace(/^\//, ""),
        image: data?.spec?.image || null,
        labels: data?.spec?.labels || {},
        resources: {
          memLimitBytes: last?.memory?.limit ?? data?.spec?.memory?.limit ?? null,
          cpuShares: data?.spec?.cpu?.limit ?? null,
        }
      };
      return res.json({ provider: "CADVISOR_ONLY", spec });
    }
  } catch (e: any) {
    if (e?.status === 404 || e?.statusCode === 404) {
      return res.status(404).json({ error: "not_found", message: e?.message || "not found" });
    }
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return res.status(504).json({ error: "inspect_timeout", message: "cAdvisor did not answer in time" });
    }
    res.status(502).json({ error: "inspect_failed", message: e?.message || "inspect failed" });
  }
});

export default r;
