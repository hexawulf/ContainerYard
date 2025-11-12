import { Router } from "express";
import { getHost } from "../config/hosts";
import { dockerClient } from "../services/docker";
import { requireAuth } from "../middleware/auth";

const r = Router();

/**
 * GET /api/hosts/:hostId/containers/:id/logs?tail=500&since=1h&stdout=true&stderr=true&follow=false
 * Only available for DOCKER provider. CADVISOR_ONLY returns 400 with guidance + dozzleUrl if present.
 */
r.get("/api/hosts/:hostId/containers/:id/logs", requireAuth, async (req, res) => {
  const { hostId, id } = req.params;
  const { tail = "500", since = "", stdout = "true", stderr = "true", follow = "false" } = req.query as Record<string,string>;
  const host = getHost(hostId as any);

  if (host.provider !== "DOCKER") {
    return res.status(400).json({ error: "logs_unsupported", message: "Logs not available for CADVISOR_ONLY", dozzleUrl: host.dozzleUrl || null });
  }

  try {
    const d = dockerClient(host.docker!.socketPath);
    const container = d.getContainer(id);
    const options: any = {
      stdout: stdout === "true",
      stderr: stderr === "true",
      tail: tail.toString(),
      follow: follow === "true",
    };
    if (since) {
      const now = Math.floor(Date.now() / 1000);
      const delta = since.endsWith("h") ? parseInt(since) * 3600 :
                    since.endsWith("m") ? parseInt(since) * 60 :
                    since.endsWith("s") ? parseInt(since) :
                    0;
      if (delta > 0) options.since = now - delta;
    }

    // Stream or once-off
    if (options.follow) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      const stream = await container.logs(options);
      stream.on("data", (chunk: Buffer) => res.write(chunk));
      stream.on("end", () => res.end());
      stream.on("error", (e: any) => { res.end(`\n[logs error] ${e?.message || e}`); });
      req.on("close", () => stream.destroy());
      return;
    } else {
      const stream = await container.logs(options);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(Buffer.from(c));
      const body = Buffer.concat(chunks).toString("utf8");
      res.type("text/plain").send(body);
    }
  } catch (e: any) {
    res.status(502).json({ error: "logs_failed", message: e?.message || "docker logs failed" });
  }
});

export default r;