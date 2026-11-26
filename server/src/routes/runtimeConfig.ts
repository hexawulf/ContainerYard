import type { Request, Response } from "express";
import { prisma } from "../db/client";
import { isFirebaseEnabled } from "../services/firebaseAuth";

export function registerRuntimeConfigRoute(app: import("express").Express) {
  app.get("/api/runtime-config", (req: Request, res: Response) => {
    const protocol = req.protocol || "https";
    const apiBase =
      process.env.PUBLIC_API_BASE ??
      `${protocol}://${req.headers.host ?? "localhost"}`;
    const dbConfigured = Boolean(prisma);

    res.json({
      apiBase,
      database: {
        type: dbConfigured ? "sqlite" : "none",
        isSQLite: dbConfigured,
        isPostgreSQL: false,
      },
      features: {
        logs: true,
        multiHost: true,
        alerts: dbConfigured,
        savedSearches: dbConfigured,
        logBookmarks: dbConfigured,
        historicalMetrics: dbConfigured,
        restartTracking: dbConfigured,
        googleSignIn: isFirebaseEnabled(),
      },
    });
  });
}
