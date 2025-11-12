import { Router } from "express";
import { getHost } from "../config/hosts";
import { dockerClient } from "../services/docker";
import { requireAuth } from "../middleware/auth";

const r = Router();

/**
 * GET /api/hosts/:hostId/containers/:id/inspect
 * - DOCKER: returns dockerode inspect JSON
 * - CADVISOR_ONLY: returns a reduced spec via cAdvisor (image, name, labels, resources)
 */
r.get("/api/hosts/:hostId/containers/:id/inspect", requireAuth, async (req, res) => {
  const { hostId, id } = req.params;
  const host = getHost(hostId as any);

  try {
    if (host.provider === "DOCKER") {
      const d = dockerClient(host.docker!.socketPath);
      const info = await d.getContainer(id).inspect();
      return res.json(info);
    } else {
      const base = host.cadvisor!.baseUrl.replace(/\/+$/, "");
      // Try both docker/<id> and <id> forms
      let resp = await fetch(`${base}/api/v1.3/containers/docker/${id}`);
      if (!resp.ok) resp = await fetch(`${base}/api/v1.3/containers/${id}`);
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
    res.status(502).json({ error: "inspect_failed", message: e?.message || "inspect failed" });
  }
});

export default r;