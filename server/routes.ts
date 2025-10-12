import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import { containerActionSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // API Routes
  app.get("/api/containers", async (req, res) => {
    try {
      const containers = await storage.provider.listContainers();
      res.json(containers);
    } catch (error: any) {
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
