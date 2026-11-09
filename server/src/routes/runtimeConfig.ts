import type { Request, Response } from "express";
import { isSQLite, isPostgreSQL } from "../config/databaseCapabilities";

export function registerRuntimeConfigRoute(app: import("express").Express) {
  app.get("/api/runtime-config", (req: Request, res: Response) => {
    const protocol = req.protocol || "https";
    const apiBase =
      process.env.PUBLIC_API_BASE ??
      `${protocol}://${req.headers.host ?? "localhost"}`;

    res.json({
      apiBase,
      database: {
        type: isSQLite ? 'sqlite' : (isPostgreSQL ? 'postgresql' : 'unknown'),
        isSQLite,
        isPostgreSQL,
      },
      features: {
        logs: true,
        multiHost: true,
        alerts: !isSQLite,
        savedSearches: true, // Prisma-backed since v3.1.1
        logBookmarks: true, // Prisma-backed since v3.1.0 (SQLite + PostgreSQL)
        historicalMetrics: !isSQLite,
        restartTracking: !isSQLite,
      },
    });
  });
}
