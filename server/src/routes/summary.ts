import { Router } from "express";
import { getHost } from "../config/hosts";
import { dockerHostSummary } from "../services/docker";
import { hostSummary as cadSummary } from "../services/cadvisor";
import { requireAuth } from "../middleware/auth";

const r = Router();
r.get("/:hostId/summary", requireAuth, async (req, res) => {
  const host = getHost(req.params.hostId as any);
  try {
    if (host.provider === "DOCKER") {
      return res.json(await dockerHostSummary(host.docker!.socketPath));
    }
    if (host.provider === "CADVISOR_ONLY") {
      return res.json(await cadSummary(host.cadvisor!.baseUrl));
    }
    res.status(400).json({ error: "Unknown provider" });
  } catch (e:any) {
    res.status(502).json({ error: e.message || "summary failed" });
  }
});
export default r;