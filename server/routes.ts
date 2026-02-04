import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import { containerActionSchema, insertSavedSearchSchema, insertLogBookmarkSchema, savedSearches, logBookmarks } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { isSQLite, logSQLiteDisabled } from "./src/config/databaseCapabilities";
import { getHost, listHosts } from "./src/config/hosts";
import { listContainers as listDockerContainers } from "./src/services/docker";
import { getCadvisorService } from "./src/services/cadvisor";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // API Routes
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

  app.get("/api/containers/:id", async (req, res) => {
    try {
      const container = await storage.provider.getContainer(req.params.id);
      if (!container) {
        return res.status(404).json({ error: "Container not found" });
      }
      res.json(container);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/containers/:id/env", async (req, res) => {
    try {
      const envVars = await storage.provider.getEnvVars(req.params.id);
      res.json(envVars);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/containers/:id/action", async (req, res) => {
    try {
      const actionResult = containerActionSchema.safeParse(req.body.action);
      if (!actionResult.success) {
        return res.status(400).json({ error: "Invalid action" });
      }

      await storage.provider.performAction(req.params.id, actionResult.data);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/containers/:id/logs/download", async (req, res) => {
    try {
      const { from, to, q } = req.query;
      const container = await storage.provider.getContainer(req.params.id);
      
      if (!container) {
        return res.status(404).json({ error: "Container not found" });
      }

      const logs = await storage.provider.getLogs(req.params.id, {
        from: from as string,
        to: to as string,
        query: q as string,
      });

      const logContent = logs
        .map(log => `[${log.ts}] ${log.level ? `[${log.level.toUpperCase()}]` : ''} ${log.raw}`)
        .join('\n');

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${container.name}-logs-${Date.now()}.log"`);
      res.send(logContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Saved Searches API - returns empty array in SQLite mode
  app.get("/api/saved-searches", async (req, res) => {
    try {
      if (isSQLite) {
        logSQLiteDisabled("Saved searches");
        return res.json([]);
      }
      const searches = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));
      res.json(searches);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/saved-searches", async (req, res) => {
    try {
      if (isSQLite) {
        return res.status(503).json({ 
          error: "Feature unavailable",
          message: "Saved searches require PostgreSQL. SQLite is currently configured.",
          sqliteMode: true
        });
      }
      
      const result = insertSavedSearchSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid search data", details: result.error });
      }
      
      const [search] = await db.insert(savedSearches).values(result.data).returning();
      res.json(search);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/saved-searches/:id", async (req, res) => {
    try {
      if (isSQLite) {
        return res.status(503).json({ 
          error: "Feature unavailable",
          message: "Saved searches require PostgreSQL. SQLite is currently configured.",
          sqliteMode: true
        });
      }
      
      await db.delete(savedSearches).where(eq(savedSearches.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Log Bookmarks API - returns empty array in SQLite mode
  app.get("/api/bookmarks", async (req, res) => {
    try {
      if (isSQLite) {
        logSQLiteDisabled("Log bookmarks");
        return res.json([]);
      }
      
      const bookmarks = await db.select().from(logBookmarks).orderBy(desc(logBookmarks.createdAt));
      res.json(bookmarks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bookmarks", async (req, res) => {
    try {
      if (isSQLite) {
        return res.status(503).json({ 
          error: "Feature unavailable",
          message: "Log bookmarks require PostgreSQL. SQLite is currently configured.",
          sqliteMode: true
        });
      }
      
      const result = insertLogBookmarkSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid bookmark data", details: result.error });
      }
      
      const [bookmark] = await db.insert(logBookmarks).values(result.data).returning();
      res.json(bookmark);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/bookmarks/:id", async (req, res) => {
    try {
      if (isSQLite) {
        return res.status(503).json({ 
          error: "Feature unavailable",
          message: "Log bookmarks require PostgreSQL. SQLite is currently configured.",
          sqliteMode: true
        });
      }
      
      await db.delete(logBookmarks).where(eq(logBookmarks.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/healthz", (req, res) => {
    res.json({ ok: true });
  });

  // WebSocket Server with proper session management
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Track active WebSocket sessions
  const activeSessions = new Map<WebSocket, () => void>();

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const type = url.searchParams.get("type");
    const containerId = url.searchParams.get("containerId");
    const sessionId = `${type}-${containerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`WebSocket connected: sessionId=${sessionId}, type=${type}, containerId=${containerId}`);

    if (type === "logs" && containerId) {
      // Create isolated callback for this specific WebSocket connection
      const cleanup = storage.provider.streamLogs(containerId, (log) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "log", log }));
          } catch (error) {
            console.error(`Error sending log to ${sessionId}:`, error);
          }
        }
      });

      activeSessions.set(ws, cleanup);

      ws.on("close", () => {
        console.log(`WebSocket closed: ${sessionId}`);
        const cleanup = activeSessions.get(ws);
        if (cleanup) {
          cleanup();
          activeSessions.delete(ws);
        }
      });
    } else if (type === "stats" && containerId) {
      // Create isolated callback for this specific WebSocket connection
      const cleanup = storage.provider.streamStats(containerId, (stats) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "stats", stats }));
          } catch (error) {
            console.error(`Error sending stats to ${sessionId}:`, error);
          }
        }
      });

      activeSessions.set(ws, cleanup);

      ws.on("close", () => {
        console.log(`WebSocket closed: ${sessionId}`);
        const cleanup = activeSessions.get(ws);
        if (cleanup) {
          cleanup();
          activeSessions.delete(ws);
        }
      });
    } else if (type === "exec" && containerId) {
      let execSessionId: string | null = null;

      // Create output callback that sends data to WebSocket
      const outputCallback = (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "exec:data",
            data,
          }));
        }
      };

      storage.provider.createExecSession(containerId, undefined, outputCallback).then((id) => {
        execSessionId = id;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "exec:ready",
            sessionId: id,
          }));

          ws.send(JSON.stringify({
            type: "exec:data",
            data: `\r\n\x1b[32mConnected to container ${containerId}\x1b[0m\r\n$ `,
          }));
        }
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === "exec:data" && execSessionId) {
            storage.provider.writeToExec(execSessionId, message.data);
            
            // Echo input to terminal
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "exec:data",
                data: message.data,
              }));
            }
          } else if (message.type === "exec:resize" && execSessionId) {
            storage.provider.resizeExec(execSessionId, message.cols, message.rows);
          }
        } catch (error) {
          console.error(`Error parsing WebSocket message for ${sessionId}:`, error);
        }
      });

      const execCleanup = () => {
        if (execSessionId) {
          storage.provider.closeExec(execSessionId);
        }
      };

      activeSessions.set(ws, execCleanup);

      ws.on("close", () => {
        console.log(`WebSocket closed: ${sessionId}`);
        const cleanup = activeSessions.get(ws);
        if (cleanup) {
          cleanup();
          activeSessions.delete(ws);
        }
      });
    }

    ws.on("error", (error) => {
      console.error(`WebSocket error for ${sessionId}:`, error);
      const cleanup = activeSessions.get(ws);
      if (cleanup) {
        cleanup();
        activeSessions.delete(ws);
      }
    });
  });

  return httpServer;
}
