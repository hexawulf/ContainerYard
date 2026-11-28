import { errorInfo } from "./lib/httpError";
import { buildHelmetOptions, permissionsPolicyMiddleware } from "./lib/csp";
import { initFirebaseAtStartup } from "./services/firebaseAuth";
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
import { registerRuntimeConfigRoute } from "./routes/runtimeConfig";
import { attachUserToResponse, globalRateLimiter, requireAuth, requireRole } from "./middleware/auth";
import { verifyCsrf } from "./middleware/csrf";
import { actionsRouter } from "./routes/actions";
import { bookmarksRouter } from "./routes/bookmarks";
import { savedSearchesRouter } from "./routes/savedSearches";
import { auditRouter } from "./routes/audit";
import { usersRouter } from "./routes/users";
import { pruneAudit } from "./services/audit";
import { pruneMonitoring } from "./services/retention";
import { log, setupVite } from "../vite";
import { registerMetrics } from "./metrics";
import { alertWorker } from "./services/alertWorker";
import { metricsAggregator } from "./services/metricsAggregator";
import { restartTracker } from "./services/restartTracker";
import { getHost, listHosts } from "./config/hosts";
import { listContainers as listDockerContainers } from "./services/docker";
import { summaryForRole } from "./lib/redact";
import { getCadvisorService } from "./services/cadvisor";

export async function createApp() {
  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet(buildHelmetOptions(process.env)));
  app.use(permissionsPolicyMiddleware);

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

  // Health endpoint - completely exempt from CSRF and session (moved before session)
  app.get("/api/health", async (_req, res) => {
    try {
      // lightweight checks; do NOT hit DB or cAdvisor
      res.status(200).json({ ok: true, uptime: process.uptime(), ts: Date.now() });
    } catch {
      res.status(503).json({ ok: false, degraded: true, ts: Date.now() });
    }
  });

  // Also expose /health for frontend health checks (same as /api/health)
  app.get("/health", async (_req, res) => {
    try {
      res.status(200).json({ ok: true, uptime: process.uptime(), ts: Date.now() });
    } catch {
      res.status(503).json({ ok: false, degraded: true, ts: Date.now() });
    }
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(sessionMiddleware);

  // After the session: signed-in users get the higher dashboard ceiling.
  app.use(globalRateLimiter);

  app.use(attachUserToResponse);

  // CSRF: every mutating /api request must carry the session's x-csrf-token.
  app.use("/api", verifyCsrf);

  app.use("/api/auth", authRouter);
  app.use("/api/hosts", hostsRouter);
  app.use("/api/hosts", requireAuth, stacksRouter);
  app.use("/api/hosts", requireAuth, actionsRouter);
  app.use("/api/hosts", requireAuth, metricsRouter);
  app.use("/api/hosts", requireAuth, summaryRouter);
  app.use("/api/hosts", requireAuth, hostLogsRouter);
  app.use(inspectRouter);
  app.use("/api/logs/download", logDownloadRouter); // has its own requireAdmin middleware
  app.use("/api/alerts", requireAuth, alertsRouter);
  app.use("/api/bookmarks", requireAuth, bookmarksRouter);
  app.use("/api/saved-searches", requireAuth, savedSearchesRouter);
  app.use("/api/audit", requireAuth, auditRouter);
  app.use("/api/users", requireAuth, requireRole("ADMIN"), usersRouter);
  registerMetrics(app);

  // Runtime config endpoint (public)
  registerRuntimeConfigRoute(app);

  // Backwards-compatible route: GET /api/containers?host=<hostId>
  // Supports both DOCKER and CADVISOR_ONLY providers
  app.get("/api/containers", requireAuth, async (req, res) => {
    try {
      const hostId = req.query.host as string | undefined;

      // If host query parameter is provided, return containers for that specific host
      if (hostId) {
        const host = getHost(hostId);

        if (host.provider === "DOCKER") {
          const containers = await listDockerContainers(host);
          return res.json(containers.map((c) => summaryForRole(c, req.session.user?.role)));
        }

        // CADVISOR_ONLY provider
        const service = getCadvisorService(host);
        if (!service) {
          return res.status(503).json({ error: "cAdvisor service unavailable for this host" });
        }
        const containers = await service.listContainers(host);
        return res.json(containers.map((c) => summaryForRole(c, req.session.user?.role)));
      }

      // No host parameter - return containers from all hosts in parallel (legacy behavior)
      const hosts = listHosts();
      const results = await Promise.allSettled(
        hosts.map(async (hostSummary) => {
          const host = getHost(hostSummary.id);
          if (host.provider === "DOCKER") {
            return await listDockerContainers(host);
          }
          const service = getCadvisorService(host);
          return service ? await service.listContainers(host) : [];
        }),
      );
      const allContainers = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled") {
          allContainers.push(...r.value);
        } else {
          console.warn(`Failed to fetch containers from host ${hosts[i].id}:`, r.reason);
        }
      }

      res.json(allContainers.map((c) => summaryForRole(c, req.session.user?.role)));
    } catch (error: unknown) {
      const { message, status } = errorInfo(error);
      if (status === 404) {
        return res.status(400).json({ error: `Unknown host: ${req.query.host}` });
      }
      const clientMessage =
        process.env.NODE_ENV === "production" ? "Internal Server Error" : message;
      res.status(500).json({ error: clientMessage });
    }
  });

  // Hard 404 for any unmatched /api/* routes
  app.all("/api/{*splat}", (req, res) => {
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
    app.get(/^\/(?!api\/).*/, (req, res) => {
      const validRoutes = ["/", "/login", "/dashboard", "/styleguide"];
      const isDynamicRoute = req.path.startsWith("/hosts/");
      
      // Explicitly handle missing static files that might fall through express.static
      if (req.path === "/sitemap.xml" || req.path === "/robots.txt") {
        return res.status(404).send("Not Found");
      }

      if (!validRoutes.includes(req.path) && !isDynamicRoute) {
        res.status(404).sendFile(path.join(distPath, "index.html"));
      } else {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const info = errorInfo(err);
    const status = info.status || info.statusCode || 500;
    const rawMessage = info.message || "Internal Server Error";
    if (status >= 500) {
      log(`${status} ${rawMessage}`, "error");
    }
    const message =
      status >= 500 && process.env.NODE_ENV === "production" && !info.expose
        ? "Internal Server Error"
        : rawMessage;

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
      if (process.env.NODE_ENV === "production") {
        process.exit(1);
      }
    }
  }

  process.on("unhandledRejection", (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, "error");
  });

  let restartPruneTimer: ReturnType<typeof setInterval> | null = null;
  let auditPruneTimer: ReturnType<typeof setInterval> | null = null;

  const port = env.PORT;
  httpServer.listen(
    {
      port,
      host: env.BIND_HOST,
      reusePort: true,
    },
    () => {
      log(`API listening on ${env.BIND_HOST}:${port}`);
      initFirebaseAtStartup(process.env, {
        info: (m) => log(m, "info"),
        warn: (m) => log(m, "warn"),
      });
      // Start background services after server is ready
      alertWorker.start().catch((error) => {
        log(`Failed to start alert worker: ${error}`, "error");
      });
      // Start restart tracker cleanup (daily)
      restartPruneTimer = setInterval(() => {
        restartTracker.cleanupOldRestarts().catch((error) => {
          log(`Failed to cleanup old restart records: ${error}`, "error");
        });
      }, 24 * 60 * 60 * 1000); // Daily
      restartPruneTimer.unref();

      // Audit log retention (AUDIT_RETENTION_DAYS, default 180)
      // Also prunes monitoring tables (METRICS_RETENTION_DAYS, ALERT_HISTORY_RETENTION_DAYS).
      const runAuditPrune = () => {
        pruneAudit().catch((error) => log(`Failed to prune audit log: ${error}`, "error"));
        pruneMonitoring().catch((error) => log(`Failed to prune monitoring tables: ${error}`, "error"));
      };
      auditPruneTimer = setInterval(runAuditPrune, 24 * 60 * 60 * 1000);
      auditPruneTimer.unref();
      runAuditPrune();

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
    if (restartPruneTimer) clearInterval(restartPruneTimer);
    if (auditPruneTimer) clearInterval(auditPruneTimer);
    alertWorker.stop();
    metricsAggregator.stop();
    redisClient.destroy();
  });

  return { app, httpServer };
}
