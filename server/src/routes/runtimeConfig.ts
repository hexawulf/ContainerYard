import type { Request, Response } from "express";
import { listHosts } from "../config/hosts";
import { isSQLite, isPostgreSQL } from "../config/databaseCapabilities";

export function registerRuntimeConfigRoute(app: import("express").Express) {
  app.get("/api/runtime-config", (req: Request, res: Response) => {
    const apiBase =
      process.env.PUBLIC_API_BASE ??
      `https://${req.headers.host ?? "container.piapps.dev"}`;

    const hosts = listHosts().map((h) => ({
      id: h.id,
      name: h.name,
      provider: h.provider,
      nodeLabel: h.nodeLabel,
    }));

    res.json({
      apiBase,
      hosts,
      database: {
        type: isSQLite ? 'sqlite' : (isPostgreSQL ? 'postgresql' : 'unknown'),
        isSQLite,
        isPostgreSQL,
      },
      features: {
        logs: true,
        multiHost: true,
        alerts: !isSQLite,
        savedSearches: !isSQLite,
        logBookmarks: !isSQLite,
        historicalMetrics: !isSQLite,
        restartTracking: !isSQLite,
      },
    });
  });
}
