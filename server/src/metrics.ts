import type { Application, Request, Response } from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { env } from "./config/env";

let initialized = false;

export function registerMetrics(app: Application) {
  if (!initialized) {
    try {
      collectDefaultMetrics();
      initialized = true;
    } catch (err) {
      console.warn('Failed to initialize Prometheus default metrics:', (err as Error).message);
      console.warn('Metrics collection disabled. This may happen on some Node versions or platforms.');
      initialized = true; // Prevent retries
    }
  }

  app.get("/metrics", async (req: Request, res: Response) => {
    if (env.METRICS_TOKEN) {
      const token = req.get("x-metrics-token");
      if (token !== env.METRICS_TOKEN) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
  });
}
