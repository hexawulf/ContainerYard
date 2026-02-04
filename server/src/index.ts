import express from "express";
import fs from "fs";
import helmet from "helmet";
import path from "path";
import { createServer } from "http";

import { env, allowedOrigins } from "./config/env";
import { sessionMiddleware, redisClient } from "./config/session";
import { prisma } from "./db/client";
import { authRouter } from "./routes/auth";
import { hostsRouter } from "./routes/hosts";
import { hostLogsRouter } from "./routes/hostLogs";
import { logDownloadRouter } from "./routes/logDownload";
import { stacksRouter } from "./routes/stacks";
import { alertsRouter } from "./routes/alerts";
import { metricsRouter } from "./routes/metrics";
import summaryRouter from "./routes/summary";
import inspectRouter from "./routes/inspect";
import { health } from "./routes/health";
import { registerRuntimeConfigRoute } from "./routes/runtimeConfig";
import { attachUserToResponse, globalRateLimiter, requireAuth } from "./middleware/auth";
import { log, setupVite } from "../vite";
import { registerMetrics } from "./metrics";
import { alertWorker } from "./services/alertWorker";
import { metricsAggregator } from "./services/metricsAggregator";
import { restartTracker } from "./services/restartTracker";
import { getHost, listHosts } from "./config/hosts";
import { listContainers as listDockerContainers } from "./services/docker";
import { getCadvisorService } from "./services/cadvisor";

export async function createApp() {
  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    }),
  );

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

    if (!origin || !allowedOrigins.includes(origin)) {
      return next();
    }

    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return next();
  });

  app.use(globalRateLimiter);

  // Health endpoint - completely exempt from CSRF and session (moved before session)
  app.get("/api/health", async (_req, res) => {
    try {
      // lightweight checks; do NOT hit DB or cAdvisor
      res.status(200).json({ ok: true, uptime: process.uptime(), ts: Date.now() });
    } catch {
      res.status(200).json({ ok: true, degraded: true, ts: Date.now() });
    }
  });

  // Also expose /health for frontend health checks (same as /api/health)
  app.get("/health", async (_req, res) => {
    try {
      res.status(200).json({ ok: true, uptime: process.uptime(), ts: Date.now() });
    } catch {
      res.status(200).json({ ok: true, degraded: true, ts: Date.now() });
    }
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(sessionMiddleware);

  app.use(attachUserToResponse);

  app.use("/api/auth", authRouter);
  app.use("/api/hosts", hostsRouter);
  app.use("/api/hosts", requireAuth, stacksRouter);
  app.use("/api/hosts", requireAuth, metricsRouter);
  app.use("/api/hosts", requireAuth, summaryRouter);
  app.use("/api/hosts", requireAuth, hostLogsRouter);
  app.use(inspectRouter);
  app.use("/api/logs/download", logDownloadRouter); // has its own requireAdmin middleware
  app.use("/api/alerts", requireAuth, alertsRouter);
  registerMetrics(app);

  // Runtime config endpoint (public)
  registerRuntimeConfigRoute(app);

  // Backwards-compatible route: GET /api/containers?host=<hostId>
  // Supports both DOCKER and CADVISOR_ONLY providers
  app.get("/api/containers", async (req, res) => {
    try {
      const hostId = req.query.host as string | undefined;

      // If host query parameter is provided, return containers for that specific host
      if (hostId) {
        const host = getHost(hostId);

        if (host.provider === "DOCKER") {
          const containers = await listDockerContainers(host);
          return res.json(containers);
        }

        // CADVISOR_ONLY provider
        const service = getCadvisorService(host);
        if (!service) {
          return res.status(503).json({ error: "cAdvisor service unavailable for this host" });
        }
        const containers = await service.listContainers(host);
        return res.json(containers);
      }

      // No host parameter - return containers from all hosts (legacy behavior)
      const allContainers = [];
      const hosts = listHosts();

      for (const hostSummary of hosts) {
        try {
          const host = getHost(hostSummary.id);

          if (host.provider === "DOCKER") {
            const containers = await listDockerContainers(host);
            allContainers.push(...containers);
          } else {
            const service = getCadvisorService(host);
            if (service) {
              const containers = await service.listContainers(host);
              allContainers.push(...containers);
            }
          }
        } catch (hostError) {
          console.warn(`Failed to fetch containers from host ${hostSummary.id}:`, hostError);
          // Continue with other hosts even if one fails
        }
      }

      res.json(allContainers);
    } catch (error: any) {
      if (error.status === 404) {
        return res.status(400).json({ error: `Unknown host: ${req.query.host}` });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Hard 404 for any unmatched /api/* routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found", path: req.path });
  });

  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    // Startup guard: fail fast if client build is missing
    const indexFile = path.join(distPath, "index.html");
    if (!fs.existsSync(indexFile)) {
      log("❌ Missing client build: dist/public/index.html not found", "error");
      process.exit(1);
    }

    app.use(express.static(distPath));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err && err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
    if (err && /misconfigured csrf/i.test(String(err))) {
      return res.status(500).json({ error: "server csrf misconfig" });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (status >= 500) {
      log(`${status} ${message}`, "error");
    }

    // Always return JSON for API routes (defensive)
    if (req.path?.startsWith("/api/")) {
      return res.status(status).json({ error: message });
    }

    // Non-API: plain text fallback
    res.status(status).send(message);
  });

  if (prisma) {
    try {
      await prisma.$connect();
    } catch (error) {
      log(`Failed to connect Prisma client: ${error}`, "error");
    }
  }

  const port = env.PORT;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`API listening on port ${port}`);
      // Start background services after server is ready
      alertWorker.start().catch((error) => {
        log(`Failed to start alert worker: ${error}`, "error");
      });
      // Start restart tracker cleanup (daily)
      setInterval(() => {
        restartTracker.cleanupOldRestarts().catch((error) => {
          log(`Failed to cleanup old restart records: ${error}`, "error");
        });
      }, 24 * 60 * 60 * 1000); // Daily

      // Initial cleanup
      restartTracker.cleanupOldRestarts().catch((error) => {
        log(`Failed to cleanup old restart records: ${error}`, "error");
      });

      metricsAggregator.start().catch((error) => {
        log(`Failed to start metrics aggregator: ${error}`, "error");
      });
    },
  );

  httpServer.on("close", () => {
    alertWorker.stop();
    metricsAggregator.stop();
    redisClient.disconnect();
  });

  return { app, httpServer };
}
