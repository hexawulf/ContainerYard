import type { Application, Request, Response } from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { env } from "./config/env";

let initialized = false;

export function registerMetrics(app: Application) {
  if (!initialized) {
    collectDefaultMetrics();
    initialized = true;
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
