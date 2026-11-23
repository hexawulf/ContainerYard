import { errorInfo } from "../lib/httpError";
import { Router } from "express";
import { getHost } from "../config/hosts";
import { dockerHostSummary } from "../services/docker";
import { hostSummary as cadSummary } from "../services/cadvisor";
import { requireAuth } from "../middleware/auth";

const r = Router();
r.get("/:hostId/summary", requireAuth, async (req, res) => {
  try {
    // Inside the try: getHost throws for an unknown id, and Express 4 does not
    // catch a rejected async handler, so the request used to hang.
    const host = getHost(req.params.hostId);
    if (host.provider === "DOCKER") {
      if (!host.docker?.socketPath) {
        return res.status(500).json({ error: "Docker socket path not configured" });
      }
      return res.json(await dockerHostSummary(host.docker.socketPath));
    }
    if (host.provider === "CADVISOR_ONLY") {
      if (!host.cadvisor?.baseUrl) {
        return res.status(500).json({ error: "cAdvisor URL not configured" });
      }
      return res.json(await cadSummary(host.cadvisor.baseUrl));
    }
    res.status(400).json({ error: "Unknown provider" });
  } catch (e: unknown) {
    const { message, status } = errorInfo(e);
    if (status === 404) {
      return res.status(404).json({ error: message || "Unknown host" });
    }
    const clientMessage =
      process.env.NODE_ENV === "production" ? "Host summary unavailable" : (message || "summary failed");
    res.status(502).json({ error: clientMessage });
  }
});
export default r;