import csurf from "csurf";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";

import { env, allowedOrigins } from "./config/env";
import { sessionMiddleware, redisClient } from "./config/session";
import { ensureBootstrapUser } from "./db/client";
import { authRouter } from "./routes/auth";
import { hostsRouter } from "./routes/hosts";
import { attachUserToResponse, globalRateLimiter, requireAuth } from "./middleware/auth";
import { log, serveStatic, setupVite } from "../vite";
import { registerMetrics } from "./metrics";

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

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(sessionMiddleware);

  const csrfProtection = csurf({ cookie: false });
  app.use(csrfProtection);
  app.use(attachUserToResponse);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/hosts", requireAuth, hostsRouter);
  registerMetrics(app);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (status >= 500) {
      log(`${status} ${message}`, "error");
    }

    res.status(status).json({ message });
  });

  await ensureBootstrapUser();

  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
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
    },
  );

  httpServer.on("close", () => {
    redisClient.disconnect();
  });

  return { app, httpServer };
}
