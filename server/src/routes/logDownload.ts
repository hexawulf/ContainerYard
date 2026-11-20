import { Router, type Request } from "express";
import { log } from "../../vite";
import { getHost } from "../config/hosts";
import { getContainerLogs } from "../services/docker";
import { LOCAL_HOST_ID } from "../config/hostlogs";
import { getProvider, HostLogSourceError } from "../services/hostLogs";
import { recordAudit } from "../services/audit";
import { requireRole } from "../middleware/auth";
import { spawn } from "child_process";
import * as fs from "fs";

const router = Router();

interface DownloadQuery {
  scope: "container" | "hostlog";
  hostId?: string;
  containerId?: string;
  name?: string;
  tail?: number;
  since?: string | number;
}

function parseDownloadQuery(query: Request["query"]): DownloadQuery {
  const scope = query.scope === "hostlog" ? "hostlog" : "container";
  const tail = query.tail ? parseInt(String(query.tail), 10) : 5000;

  return {
    scope,
    hostId: query.hostId ? String(query.hostId) : undefined,
    // `id` accepted for older clients that sent it instead of containerId
    containerId: query.containerId ?? query.id ? String(query.containerId ?? query.id) : undefined,
    name: query.name ? String(query.name) : undefined,
    tail: Number.isNaN(tail) ? 5000 : Math.min(Math.max(tail, 1), 10000),
    since: query.since ? String(query.since) : undefined,
  };
}

function safeFilenameToken(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64) || "hostlog";
}

// Download container or host logs
router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const options = parseDownloadQuery(req.query);

    if (options.scope === "container") {
      if (!options.hostId || !options.containerId) {
        return res.status(400).json({
          error: "Missing required parameters",
          message: "For container logs, provide: scope=container, hostId, containerId",
        });
      }

      const host = getHost(options.hostId);

      if (host.provider !== "DOCKER") {
        return res.status(400).json({
          error: "Unsupported host",
          message: "Log downloads only supported for Docker hosts",
        });
      }

      const logs = await getContainerLogs(host, options.containerId, {
        tail: options.tail,
        since: options.since,
        stdout: true,
        stderr: true,
      });

      const filename = `${safeFilenameToken(options.containerId.slice(0, 12))}-${Date.now()}.log`;

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      res.send(logs);
    } else if (options.scope === "hostlog") {
      if (!options.name) {
        return res.status(400).json({
          error: "Missing required parameters",
          message: "For host logs, provide: scope=hostlog, name",
        });
      }

      const hostId = options.hostId || LOCAL_HOST_ID;
      const provider = getProvider(hostId);
      if (!provider) {
        return res.status(404).json({
          error: "Log not found",
          message: `No log source is configured for host ${hostId}`,
        });
      }

      const localFile = provider.resolveLocalFile ? await provider.resolveLocalFile(options.name) : null;
      if (provider.type === "local" && localFile !== null) {
        try {
          await fs.promises.stat(localFile);
        } catch {
          return res.status(404).json({
            error: "File not found",
            message: `Log file does not exist: ${localFile}`,
          });
        }

        try {
          await fs.promises.access(localFile, fs.constants.R_OK);
        } catch {
          return res.status(403).json({
            error: "Access denied",
            message: `Cannot read log file: ${localFile}`,
          });
        }

        const filename = `${safeFilenameToken(options.name)}-${Date.now()}.log`;

        void recordAudit(req, {
          action: "hostlogs.read",
          outcome: "success",
          hostId,
          target: `${hostId}/${options.name}`,
          detail: "download",
        });

        // X-Content-Type-Options is already set globally by helmet.
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        const tail = spawn("tail", ["-n", String(options.tail), "--", localFile]);
        tail.stdout.pipe(res);

        tail.stderr.on("data", (data) => {
          log(`tail stderr: ${data.toString()}`, "error");
        });

        tail.on("error", (err) => {
          log(`tail error: ${err}`, "error");
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to read log file" });
          }
        });

        req.on("close", () => {
          tail.kill();
        });
        return;
      }

      // Remote PiDeck agent or local Docker self-container (`cy_app`)
      try {
        const isRemote = provider.type === "pideck-agent";
        const requestedLines = isRemote ? Math.min(options.tail ?? 2000, 2000) : (options.tail ?? 5000);
        const result = await provider.tail(options.name, { lines: requestedLines });

        void recordAudit(req, {
          action: "hostlogs.read",
          outcome: "success",
          hostId,
          target: `${hostId}/${options.name}`,
          detail: isRemote ? "download (remote snapshot, max 2000 lines)" : "download",
        });

        const safeName = safeFilenameToken(options.name);
        const filename = isRemote
          ? `${safeName}-snapshot-max2000-${Date.now()}.log`
          : `${safeName}-${Date.now()}.log`;

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        if (isRemote) {
          res.setHeader("X-CY-Log-Snapshot", "up-to-2000-lines");
        }
        if (result.truncated) {
          res.setHeader("X-CY-Log-Truncated", "true");
        }
        if (result.redacted && result.redacted > 0) {
          res.setHeader("X-CY-Log-Redacted", String(result.redacted));
        }

        const header = isRemote
          ? `# Remote host log snapshot (${hostId}/${options.name}, up to 2000 lines)\n`
          : "";
        res.send(`${header}${result.lines.join("\n")}`);
      } catch (err) {
        if (err instanceof HostLogSourceError) {
          const status = err.status === 404 || err.status === 400 ? err.status : 502;
          return res.status(status).json({ error: err.reason, message: err.message });
        }
        throw err;
      }
    } else {
      return res.status(400).json({
        error: "Invalid scope",
        message: "Scope must be 'container' or 'hostlog'",
      });
    }
  } catch (error) {
    next(error);
  }
});

export { router as logDownloadRouter };
