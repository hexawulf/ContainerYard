# ContainerYard - Phase 1 Implementation Plan

**Version:** 1.0  
**Date:** October 26, 2025  
**Estimated Timeline:** 2-3 weeks  
**Target Features:** Container Actions, Log Bookmarks, Alerting System

---

## 📋 Overview

This document outlines the detailed implementation plan for the three highest-priority features that will transform ContainerYard from a monitoring tool into a full-featured container management platform:

1. **Container Lifecycle Actions** - Start/stop/restart containers from the UI
2. **Log Bookmarks & Moments** - Pin and share critical log timestamps
3. **Log Pattern Alerts** - Proactive monitoring with notifications

---

## 🎯 Feature 1: Container Lifecycle Actions

### Goal
Enable ADMIN users to perform container lifecycle operations (start, stop, restart, pause, unpause, remove) directly from the dashboard without SSH access.

### Requirements

#### Functional Requirements
- ✅ Admin-only access (VIEWER role blocked)
- ✅ Support actions: start, stop, restart, pause, unpause, remove
- ✅ Confirmation dialogs for destructive actions (stop, remove)
- ✅ Real-time UI updates after action completion
- ✅ Error handling with user-friendly messages
- ✅ Action history/audit trail

#### Non-Functional Requirements
- ⚡ Action response time: < 3 seconds
- 🔒 CSRF protection on all POST endpoints
- 📝 Comprehensive error logging
- 🚫 Only Unix socket access (no TCP Docker socket)

---

### Architecture

#### Backend Changes

**1. New Route: `/server/src/routes/containerActions.ts`**

```typescript
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { getHost } from "../config/hosts";
import { 
  startContainer, 
  stopContainer, 
  restartContainer,
  pauseContainer,
  unpauseContainer,
  removeContainer 
} from "../services/docker";
import { createAuditLog } from "../services/audit";

const router = Router();

// All actions require ADMIN role
router.use(requireRole("ADMIN"));

type ContainerAction = "start" | "stop" | "restart" | "pause" | "unpause" | "remove";

interface ActionRequest {
  action: ContainerAction;
  force?: boolean; // for stop/remove
  removeVolumes?: boolean; // for remove
}

router.post("/:hostId/containers/:containerId/actions", async (req, res, next) => {
  try {
    const { hostId, containerId } = req.params;
    const { action, force = false, removeVolumes = false } = req.body as ActionRequest;

    const host = getHost(hostId);
    if (host.provider !== "DOCKER") {
      return res.status(501).json({ 
        success: false, 
        message: "Container actions only supported for Docker hosts" 
      });
    }

    // Validate action
    const validActions: ContainerAction[] = ["start", "stop", "restart", "pause", "unpause", "remove"];
    if (!validActions.includes(action)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid action: ${action}` 
      });
    }

    // Execute action
    let result;
    switch (action) {
      case "start":
        result = await startContainer(containerId);
        break;
      case "stop":
        result = await stopContainer(containerId, { force });
        break;
      case "restart":
        result = await restartContainer(containerId, { timeout: 10 });
        break;
      case "pause":
        result = await pauseContainer(containerId);
        break;
      case "unpause":
        result = await unpauseContainer(containerId);
        break;
      case "remove":
        result = await removeContainer(containerId, { force, removeVolumes });
        break;
    }

    // Audit log
    await createAuditLog({
      userId: req.user!.id,
      action: `container_${action}`,
      resourceType: "container",
      resourceId: containerId,
      details: { hostId, action, force, removeVolumes },
      ipAddress: req.ip,
    });

    return res.json({ 
      success: true, 
      message: `Container ${action} successful`,
      data: result 
    });

  } catch (error: any) {
    // Log error
    console.error(`Container action failed:`, error);

    // Audit log failure
    await createAuditLog({
      userId: req.user!.id,
      action: `container_${req.body.action}_failed`,
      resourceType: "container",
      resourceId: req.params.containerId,
      details: { error: error.message },
      ipAddress: req.ip,
    });

    next(error);
  }
});

export { router as containerActionsRouter };
```

**2. Extend Docker Service: `/server/src/services/docker.ts`**

```typescript
import Dockerode from "dockerode";

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });

export async function startContainer(containerId: string) {
  const container = docker.getContainer(containerId);
  await container.start();
  return { status: "started" };
}

export async function stopContainer(
  containerId: string, 
  options: { force?: boolean } = {}
) {
  const container = docker.getContainer(containerId);
  const timeout = options.force ? 0 : 10; // force = immediate kill
  await container.stop({ t: timeout });
  return { status: "stopped" };
}

export async function restartContainer(
  containerId: string,
  options: { timeout?: number } = {}
) {
  const container = docker.getContainer(containerId);
  await container.restart({ t: options.timeout || 10 });
  return { status: "restarted" };
}

export async function pauseContainer(containerId: string) {
  const container = docker.getContainer(containerId);
  await container.pause();
  return { status: "paused" };
}

export async function unpauseContainer(containerId: string) {
  const container = docker.getContainer(containerId);
  await container.unpause();
  return { status: "unpaused" };
}

export async function removeContainer(
  containerId: string,
  options: { force?: boolean; removeVolumes?: boolean } = {}
) {
  const container = docker.getContainer(containerId);
  await container.remove({ 
    force: options.force, 
    v: options.removeVolumes 
  });
  return { status: "removed" };
}
```

**3. New Audit Service: `/server/src/services/audit.ts`**

```typescript
import { db } from "../db/client";

interface AuditLogParams {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

export async function createAuditLog(params: AuditLogParams) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details || {},
      ipAddress: params.ipAddress,
      createdAt: new Date(),
    },
  });
}

export async function getAuditLogs(filters: {
  userId?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  return db.auditLog.findMany({
    where: {
      userId: filters.userId,
      resourceId: filters.resourceId,
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit || 100,
    include: {
      user: {
        select: { email: true, role: true },
      },
    },
  });
}
```

**4. Database Migration: `/server/prisma/migrations/XXX_add_audit_logs/migration.sql`**

```sql
-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_resource_id_idx" ON "audit_logs"("resource_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**5. Prisma Schema Update: `/server/prisma/schema.prisma`**

```prisma
model AuditLog {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action       String
  resourceType String   @map("resource_type")
  resourceId   String   @map("resource_id")
  details      Json?
  ipAddress    String?  @map("ip_address")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

model User {
  // ... existing fields
  auditLogs AuditLog[]
}
```

**6. Mount Router: `/server/src/index.ts`**

```typescript
import { containerActionsRouter } from "./routes/containerActions";

// After auth middleware
app.use("/api", containerActionsRouter);
```

---

#### Frontend Changes

**1. Action Buttons Component: `/client/src/components/ContainerActions.tsx`**

```typescript
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Play, 
  Square, 
  RotateCw, 
  Pause, 
  Trash2, 
  MoreVertical,
  Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import type { ContainerSummary } from "@shared/monitoring";

interface ContainerActionsProps {
  container: ContainerSummary;
  hostId: string;
  disabled?: boolean;
}

type Action = "start" | "stop" | "restart" | "pause" | "unpause" | "remove";

export function ContainerActions({ container, hostId, disabled }: ContainerActionsProps) {
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [forceStop, setForceStop] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const actionMutation = useMutation({
    mutationFn: async ({ action, force = false }: { action: Action; force?: boolean }) => {
      const res = await fetch(
        `${API_BASE}/${hostId}/containers/${container.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action, force }),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Action failed");
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Success",
        description: data.message || `Container ${variables.action} successful`,
      });
      
      // Invalidate queries to refresh container list
      queryClient.invalidateQueries({ 
        queryKey: ["/api/hosts", hostId, "containers"] 
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: Action, force = false) => {
    setConfirmAction(null);
    actionMutation.mutate({ action, force });
  };

  const getActionConfig = (action: Action) => {
    const configs = {
      start: { 
        label: "Start", 
        icon: Play, 
        variant: "default" as const,
        confirm: false 
      },
      stop: { 
        label: "Stop", 
        icon: Square, 
        variant: "destructive" as const,
        confirm: true,
        description: "This will gracefully stop the container (10s timeout)." 
      },
      restart: { 
        label: "Restart", 
        icon: RotateCw, 
        variant: "default" as const,
        confirm: true,
        description: "This will restart the container." 
      },
      pause: { 
        label: "Pause", 
        icon: Pause, 
        variant: "secondary" as const,
        confirm: false 
      },
      unpause: { 
        label: "Unpause", 
        icon: Play, 
        variant: "default" as const,
        confirm: false 
      },
      remove: { 
        label: "Remove", 
        icon: Trash2, 
        variant: "destructive" as const,
        confirm: true,
        description: "This will permanently delete the container. Data in volumes will be preserved." 
      },
    };
    return configs[action];
  };

  const isRunning = container.state === "running";
  const isPaused = container.state === "paused";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={disabled || actionMutation.isPending}
          >
            {actionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isRunning && !isPaused && (
            <DropdownMenuItem onClick={() => handleAction("start")}>
              <Play className="h-4 w-4 mr-2" />
              Start
            </DropdownMenuItem>
          )}
          {isRunning && (
            <>
              <DropdownMenuItem onClick={() => setConfirmAction("stop")}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("restart")}>
                <RotateCw className="h-4 w-4 mr-2" />
                Restart
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAction("pause")}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </DropdownMenuItem>
            </>
          )}
          {isPaused && (
            <DropdownMenuItem onClick={() => handleAction("unpause")}>
              <Play className="h-4 w-4 mr-2" />
              Unpause
            </DropdownMenuItem>
          )}
          <DropdownMenuItem 
            onClick={() => setConfirmAction("remove")}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <AlertDialog open onOpenChange={() => setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Confirm {getActionConfig(confirmAction).label}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {getActionConfig(confirmAction).description}
                <br />
                <br />
                Container: <strong>{container.name}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleAction(confirmAction, forceStop)}
              >
                {getActionConfig(confirmAction).label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
```

**2. Integrate into ContainerTable: `/client/src/features/monitoring/ContainerTable.tsx`**

```typescript
import { ContainerActions } from "@/components/ContainerActions";
import { useAuth } from "@/components/AuthGate";

export function ContainerTable({ containers, host, ... }: ContainerTableProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <Table>
      {/* ... existing columns */}
      <TableColumn>
        <TableHead>Actions</TableHead>
        <TableCell>
          <div className="flex gap-1">
            <Button onClick={() => onLogsClick(container.id)}>
              <FileText />
            </Button>
            <Button onClick={() => onInspectClick(container.id)}>
              <Info />
            </Button>
            {isAdmin && host?.provider === "DOCKER" && (
              <ContainerActions 
                container={container} 
                hostId={host.id} 
              />
            )}
          </div>
        </TableCell>
      </TableColumn>
    </Table>
  );
}
```

---

### Testing Plan

#### Unit Tests

```typescript
// /server/tests/containerActions.spec.ts
describe("Container Actions API", () => {
  it("should start a stopped container", async () => {
    const res = await request(app)
      .post("/api/piapps/containers/test-container/actions")
      .set("Cookie", adminCookie)
      .send({ action: "start" });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should reject actions for VIEWER role", async () => {
    const res = await request(app)
      .post("/api/piapps/containers/test-container/actions")
      .set("Cookie", viewerCookie)
      .send({ action: "stop" });
    
    expect(res.status).toBe(403);
  });

  it("should create audit log on action", async () => {
    await request(app)
      .post("/api/piapps/containers/test-container/actions")
      .set("Cookie", adminCookie)
      .send({ action: "restart" });
    
    const logs = await db.auditLog.findMany({ 
      where: { action: "container_restart" } 
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});
```

#### Integration Tests

```bash
# Manual testing script
#!/bin/bash

COOKIE="cy.sid=YOUR_SESSION_COOKIE"
BASE="https://container.piapps.dev/api"
CONTAINER_ID="crypto-agent-grafana-1"

# Test start
curl -X POST "$BASE/piapps/containers/$CONTAINER_ID/actions" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' | jq .

# Test stop
curl -X POST "$BASE/piapps/containers/$CONTAINER_ID/actions" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"action":"stop"}' | jq .

# Test restart
curl -X POST "$BASE/piapps/containers/$CONTAINER_ID/actions" \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"action":"restart"}' | jq .
```

---

### Acceptance Criteria

- [ ] ADMIN users can start/stop/restart/pause/unpause/remove containers
- [ ] VIEWER users are blocked from all actions (403 response)
- [ ] Confirmation dialogs appear for destructive actions (stop, remove)
- [ ] UI updates immediately after action completion
- [ ] Error messages are user-friendly and actionable
- [ ] All actions create audit log entries
- [ ] Actions only work on DOCKER provider hosts (synology blocked)
- [ ] Docker socket remains Unix-only (no TCP exposure)

---

## 🔖 Feature 2: Log Bookmarks & Moments

### Goal
Allow users to bookmark specific log timestamps with notes, share deep-links, and quickly navigate to critical moments during debugging sessions.

### Requirements

#### Functional Requirements
- ✅ Bookmark any log line with a note
- ✅ Share bookmark via URL (deep-link)
- ✅ View all bookmarks for a container
- ✅ Export bookmarks to JSON
- ✅ Delete bookmarks
- ✅ Highlight bookmarked timestamps in log viewer

#### Non-Functional Requirements
- 📦 Store context: 10 lines before + 10 lines after bookmark
- 🔗 Shareable URLs survive container restarts (use timestamp, not line number)
- 🎨 Visual indicators in timeline/log viewer

---

### Architecture

#### Backend Changes

**1. Database Migration: `/server/prisma/migrations/XXX_add_log_bookmarks/migration.sql`**

```sql
-- CreateTable
CREATE TABLE "log_bookmarks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "container_name" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "context_before" TEXT[],
    "context_after" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "log_bookmarks_user_id_idx" ON "log_bookmarks"("user_id");
CREATE INDEX "log_bookmarks_container_id_idx" ON "log_bookmarks"("container_id");
CREATE INDEX "log_bookmarks_timestamp_idx" ON "log_bookmarks"("timestamp");

-- AddForeignKey
ALTER TABLE "log_bookmarks" ADD CONSTRAINT "log_bookmarks_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**2. Prisma Schema: `/server/prisma/schema.prisma`**

```prisma
model LogBookmark {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  hostId        String   @map("host_id")
  containerId   String   @map("container_id")
  containerName String   @map("container_name")
  timestamp     DateTime
  note          String?
  contextBefore String[] @map("context_before")
  contextAfter  String[] @map("context_after")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([containerId])
  @@index([timestamp])
  @@map("log_bookmarks")
}

model User {
  // ... existing fields
  logBookmarks LogBookmark[]
}
```

**3. Bookmark Routes: `/server/src/routes/bookmarks.ts`**

```typescript
import { Router } from "express";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// List user's bookmarks
router.get("/", async (req, res, next) => {
  try {
    const bookmarks = await db.logBookmark.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ bookmarks });
  } catch (error) {
    next(error);
  }
});

// Get bookmarks for specific container
router.get("/container/:containerId", async (req, res, next) => {
  try {
    const bookmarks = await db.logBookmark.findMany({
      where: { 
        userId: req.user!.id,
        containerId: req.params.containerId,
      },
      orderBy: { timestamp: "asc" },
    });
    res.json({ bookmarks });
  } catch (error) {
    next(error);
  }
});

// Get single bookmark (for deep-links)
router.get("/:id", async (req, res, next) => {
  try {
    const bookmark = await db.logBookmark.findUnique({
      where: { id: req.params.id },
    });

    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    // Allow viewing if owner or admin
    if (bookmark.userId !== req.user!.id && req.user!.role !== "ADMIN") {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(bookmark);
  } catch (error) {
    next(error);
  }
});

// Create bookmark
router.post("/", async (req, res, next) => {
  try {
    const { hostId, containerId, containerName, timestamp, note, contextBefore, contextAfter } = req.body;

    const bookmark = await db.logBookmark.create({
      data: {
        userId: req.user!.id,
        hostId,
        containerId,
        containerName,
        timestamp: new Date(timestamp),
        note,
        contextBefore: contextBefore || [],
        contextAfter: contextAfter || [],
      },
    });

    res.status(201).json(bookmark);
  } catch (error) {
    next(error);
  }
});

// Update bookmark note
router.patch("/:id", async (req, res, next) => {
  try {
    const bookmark = await db.logBookmark.findUnique({
      where: { id: req.params.id },
    });

    if (!bookmark || bookmark.userId !== req.user!.id) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const updated = await db.logBookmark.update({
      where: { id: req.params.id },
      data: { note: req.body.note },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete bookmark
router.delete("/:id", async (req, res, next) => {
  try {
    const bookmark = await db.logBookmark.findUnique({
      where: { id: req.params.id },
    });

    if (!bookmark || bookmark.userId !== req.user!.id) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    await db.logBookmark.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export { router as bookmarksRouter };
```

**4. Mount Router: `/server/src/index.ts`**

```typescript
import { bookmarksRouter } from "./routes/bookmarks";

app.use("/api/bookmarks", bookmarksRouter);
```

---

#### Frontend Changes

**1. Bookmark Button Component: `/client/src/components/LogBookmarkButton.tsx`**

```typescript
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

interface LogBookmarkButtonProps {
  hostId: string;
  containerId: string;
  containerName: string;
  timestamp: string;
  logLine: string;
  contextBefore?: string[];
  contextAfter?: string[];
  isBookmarked?: boolean;
}

export function LogBookmarkButton({
  hostId,
  containerId,
  containerName,
  timestamp,
  logLine,
  contextBefore = [],
  contextAfter = [],
  isBookmarked = false,
}: LogBookmarkButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (bookmarkNote: string) => {
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hostId,
          containerId,
          containerName,
          timestamp,
          note: bookmarkNote,
          contextBefore,
          contextAfter,
        }),
      });

      if (!res.ok) throw new Error("Failed to create bookmark");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bookmark created" });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      setDialogOpen(false);
      setNote("");
    },
    onError: () => {
      toast({ 
        title: "Failed to create bookmark", 
        variant: "destructive" 
      });
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialogOpen(true)}
      >
        {isBookmarked ? (
          <BookmarkCheck className="h-4 w-4 text-primary" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Log Bookmark</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Timestamp</Label>
              <p className="text-sm text-muted-foreground font-mono">
                {new Date(timestamp).toLocaleString()}
              </p>
            </div>

            <div>
              <Label>Log Line</Label>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {logLine}
              </pre>
            </div>

            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                placeholder="Why is this moment important?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createMutation.mutate(note)}
              disabled={createMutation.isPending}
            >
              Save Bookmark
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**2. Bookmarks Sidebar: `/client/src/components/LogBookmarks.tsx`**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

interface LogBookmarksProps {
  containerId?: string;
  onJumpToTimestamp?: (timestamp: string) => void;
}

export function LogBookmarks({ containerId, onJumpToTimestamp }: LogBookmarksProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: containerId 
      ? ["/api/bookmarks/container", containerId]
      : ["/api/bookmarks"],
    queryFn: async () => {
      const url = containerId
        ? `${API_BASE}/bookmarks/container/${containerId}`
        : `${API_BASE}/bookmarks`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bookmarks");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (bookmarkId: string) => {
      const res = await fetch(`${API_BASE}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete bookmark");
    },
    onSuccess: () => {
      toast({ title: "Bookmark deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
  });

  const copyDeepLink = (bookmarkId: string) => {
    const url = `${window.location.origin}/bookmarks/${bookmarkId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  const bookmarks = data?.bookmarks || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log Bookmarks ({bookmarks.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {bookmarks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookmarks yet. Click the bookmark icon on any log line.
              </p>
            ) : (
              bookmarks.map((bookmark: any) => (
                <div
                  key={bookmark.id}
                  className="border rounded p-3 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(bookmark.timestamp).toLocaleString()}
                      </p>
                      <p className="text-sm font-medium">
                        {bookmark.containerName}
                      </p>
                    </div>
                    <Badge variant="outline">{bookmark.hostId}</Badge>
                  </div>

                  {bookmark.note && (
                    <p className="text-sm text-muted-foreground">
                      {bookmark.note}
                    </p>
                  )}

                  <div className="flex gap-2">
                    {onJumpToTimestamp && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onJumpToTimestamp(bookmark.timestamp)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Jump
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyDeepLink(bookmark.id)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(bookmark.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

**3. Integrate into LogsDrawer: `/client/src/features/monitoring/LogsDrawer.tsx`**

```typescript
import { LogBookmarkButton } from "@/components/LogBookmarkButton";
import { LogBookmarks } from "@/components/LogBookmarks";

export function LogsDrawer({ hostId, containerId, containerName }: LogsDrawerProps) {
  const [logLines, setLogLines] = useState<Array<{ timestamp: string; text: string }>>([]);

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      {/* Main log viewer */}
      <div>
        {logLines.map((line, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <LogBookmarkButton
              hostId={hostId}
              containerId={containerId}
              containerName={containerName}
              timestamp={line.timestamp}
              logLine={line.text}
              contextBefore={logLines.slice(Math.max(0, idx - 10), idx).map(l => l.text)}
              contextAfter={logLines.slice(idx + 1, idx + 11).map(l => l.text)}
            />
            <pre>{line.text}</pre>
          </div>
        ))}
      </div>

      {/* Bookmarks sidebar */}
      <LogBookmarks 
        containerId={containerId}
        onJumpToTimestamp={(ts) => {
          // Scroll to timestamp in log viewer
          const element = document.querySelector(`[data-timestamp="${ts}"]`);
          element?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
    </div>
  );
}
```

**4. Deep-Link Route: `/client/src/App.tsx`**

```typescript
import { Route, Switch } from "wouter";
import BookmarkDeepLink from "@/pages/BookmarkDeepLink";

function App() {
  return (
    <Switch>
      {/* ... existing routes */}
      <Route path="/bookmarks/:id" component={BookmarkDeepLink} />
    </Switch>
  );
}
```

**5. Deep-Link Page: `/client/src/pages/BookmarkDeepLink.tsx`**

```typescript
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { API_BASE } from "@/lib/api";

export default function BookmarkDeepLink() {
  const [, params] = useRoute("/bookmarks/:id");
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/bookmarks", params?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/bookmarks/${params?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Bookmark not found");
      return res.json();
    },
    enabled: Boolean(params?.id),
  });

  useEffect(() => {
    if (data) {
      // Redirect to logs page with timestamp
      setLocation(
        `/dashboard?host=${data.hostId}&container=${data.containerId}&ts=${data.timestamp}`
      );
    }
  }, [data]);

  if (isLoading) return <div>Loading bookmark...</div>;

  return null;
}
```

---

### Testing Plan

```typescript
// /server/tests/bookmarks.spec.ts
describe("Bookmarks API", () => {
  it("should create bookmark with context", async () => {
    const res = await request(app)
      .post("/api/bookmarks")
      .set("Cookie", userCookie)
      .send({
        hostId: "piapps",
        containerId: "test-container",
        containerName: "test",
        timestamp: "2025-10-26T12:00:00Z",
        note: "Error occurred here",
        contextBefore: ["line 1", "line 2"],
        contextAfter: ["line 3", "line 4"],
      });

    expect(res.status).toBe(201);
    expect(res.body.note).toBe("Error occurred here");
  });

  it("should list user's bookmarks only", async () => {
    // Create bookmark for user1
    await createBookmark(user1.id, "container-1");
    await createBookmark(user2.id, "container-2");

    const res = await request(app)
      .get("/api/bookmarks")
      .set("Cookie", user1Cookie);

    expect(res.body.bookmarks.length).toBe(1);
    expect(res.body.bookmarks[0].userId).toBe(user1.id);
  });

  it("should allow deep-link access for owner", async () => {
    const bookmark = await createBookmark(user1.id, "container-1");

    const res = await request(app)
      .get(`/api/bookmarks/${bookmark.id}`)
      .set("Cookie", user1Cookie);

    expect(res.status).toBe(200);
  });
});
```

---

### Acceptance Criteria

- [ ] Users can bookmark any log line with timestamp
- [ ] Bookmarks include 10 lines before/after for context
- [ ] Bookmarks sidebar shows all bookmarks for current container
- [ ] Clicking bookmark jumps to timestamp in log viewer
- [ ] Deep-links work: `/bookmarks/:id` redirects to log viewer
- [ ] Users can only see/edit their own bookmarks
- [ ] Export bookmarks to JSON
- [ ] Bookmarks survive container restarts (tied to timestamp)

---

## 🚨 Feature 3: Log Pattern Alerts

### Goal
Enable proactive monitoring by creating alerts that trigger on log patterns (grep matches) with configurable thresholds and notification channels.

### Requirements

#### Functional Requirements
- ✅ Create alerts on grep patterns per container
- ✅ Threshold: trigger if pattern matches N times in M seconds
- ✅ Notification channels: Webhook, Email (future: Slack, Discord)
- ✅ Enable/disable alerts without deleting
- ✅ Alert history (when triggered, notification sent)
- ✅ Snooze alerts for X minutes

#### Non-Functional Requirements
- ⚡ Alert evaluation: Max 10s latency
- 📊 Support up to 100 active alerts per user
- 🔔 Deduplication: Don't spam if condition persists

---

### Architecture

#### Backend Changes

**1. Database Migration: `/server/prisma/migrations/XXX_add_alerts/migration.sql`**

```sql
-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host_id" TEXT,
    "container_id" TEXT,
    "pattern" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "window_seconds" INTEGER NOT NULL DEFAULT 60,
    "channel" TEXT NOT NULL,
    "channel_config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered" TIMESTAMP(3),
    "snooze_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_triggers" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_count" INTEGER NOT NULL,
    "sample_lines" TEXT[],
    "notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "notification_error" TEXT,

    CONSTRAINT "alert_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_user_id_idx" ON "alerts"("user_id");
CREATE INDEX "alerts_container_id_idx" ON "alerts"("container_id");
CREATE INDEX "alerts_enabled_idx" ON "alerts"("enabled");
CREATE INDEX "alert_triggers_alert_id_idx" ON "alert_triggers"("alert_id");
CREATE INDEX "alert_triggers_triggered_at_idx" ON "alert_triggers"("triggered_at");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_triggers" ADD CONSTRAINT "alert_triggers_alert_id_fkey" 
  FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**2. Prisma Schema: `/server/prisma/schema.prisma`**

```prisma
model Alert {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String
  hostId        String?  @map("host_id")
  containerId   String?  @map("container_id")
  pattern       String
  threshold     Int      @default(1)
  windowSeconds Int      @default(60) @map("window_seconds")
  channel       String   // webhook, email
  channelConfig Json?    @map("channel_config")
  enabled       Boolean  @default(true)
  lastTriggered DateTime? @map("last_triggered")
  snoozeUntil   DateTime? @map("snooze_until")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  triggers      AlertTrigger[]

  @@index([userId])
  @@index([containerId])
  @@index([enabled])
  @@map("alerts")
}

model AlertTrigger {
  id                String   @id @default(uuid())
  alertId           String   @map("alert_id")
  alert             Alert    @relation(fields: [alertId], references: [id], onDelete: Cascade)
  triggeredAt       DateTime @default(now()) @map("triggered_at")
  matchCount        Int      @map("match_count")
  sampleLines       String[] @map("sample_lines")
  notificationSent  Boolean  @default(false) @map("notification_sent")
  notificationError String?  @map("notification_error")

  @@index([alertId])
  @@index([triggeredAt])
  @@map("alert_triggers")
}

model User {
  // ... existing fields
  alerts Alert[]
}
```

**3. Alert Service: `/server/src/services/alerting.ts`**

```typescript
import { db } from "../db/client";
import { getContainerLogs } from "./docker";

interface AlertEvaluation {
  alertId: string;
  matched: boolean;
  matchCount: number;
  sampleLines: string[];
}

export async function evaluateAlert(alertId: string): Promise<AlertEvaluation> {
  const alert = await db.alert.findUnique({ where: { id: alertId } });
  if (!alert || !alert.enabled) {
    return { alertId, matched: false, matchCount: 0, sampleLines: [] };
  }

  // Skip if snoozed
  if (alert.snoozeUntil && alert.snoozeUntil > new Date()) {
    return { alertId, matched: false, matchCount: 0, sampleLines: [] };
  }

  // Fetch logs from the window
  const sinceSeconds = alert.windowSeconds;
  const logs = await getContainerLogs(alert.containerId!, {
    since: sinceSeconds,
    tail: 5000,
    grep: alert.pattern,
  });

  const lines = logs.split("\n").filter((l) => l.length > 0);
  const matchCount = lines.length;

  const matched = matchCount >= alert.threshold;

  return {
    alertId,
    matched,
    matchCount,
    sampleLines: lines.slice(0, 5), // First 5 matches
  };
}

export async function triggerAlert(evaluation: AlertEvaluation) {
  if (!evaluation.matched) return;

  const alert = await db.alert.findUnique({ where: { id: evaluation.alertId } });
  if (!alert) return;

  // Create trigger record
  const trigger = await db.alertTrigger.create({
    data: {
      alertId: alert.id,
      matchCount: evaluation.matchCount,
      sampleLines: evaluation.sampleLines,
    },
  });

  // Send notification
  try {
    await sendNotification(alert, trigger, evaluation);
    
    await db.alertTrigger.update({
      where: { id: trigger.id },
      data: { notificationSent: true },
    });
  } catch (error: any) {
    await db.alertTrigger.update({
      where: { id: trigger.id },
      data: { 
        notificationSent: false, 
        notificationError: error.message 
      },
    });
  }

  // Update last triggered
  await db.alert.update({
    where: { id: alert.id },
    data: { lastTriggered: new Date() },
  });
}

async function sendNotification(alert: any, trigger: any, evaluation: AlertEvaluation) {
  if (alert.channel === "webhook") {
    const webhookUrl = alert.channelConfig?.url;
    if (!webhookUrl) throw new Error("Webhook URL not configured");

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert: {
          id: alert.id,
          name: alert.name,
          pattern: alert.pattern,
          threshold: alert.threshold,
        },
        trigger: {
          matchCount: evaluation.matchCount,
          sampleLines: evaluation.sampleLines,
          timestamp: trigger.triggeredAt,
        },
        container: {
          id: alert.containerId,
          host: alert.hostId,
        },
      }),
    });
  }

  // TODO: Add email channel
}

export async function snoozeAlert(alertId: string, minutes: number) {
  const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
  await db.alert.update({
    where: { id: alertId },
    data: { snoozeUntil },
  });
}
```

**4. Alert Polling Job: `/server/src/jobs/alertPoller.ts`**

```typescript
import { db } from "../db/client";
import { evaluateAlert, triggerAlert } from "../services/alerting";

export async function startAlertPoller() {
  console.log("Starting alert poller...");

  setInterval(async () => {
    try {
      const alerts = await db.alert.findMany({
        where: { enabled: true },
      });

      for (const alert of alerts) {
        const evaluation = await evaluateAlert(alert.id);
        if (evaluation.matched) {
          await triggerAlert(evaluation);
        }
      }
    } catch (error) {
      console.error("Alert polling error:", error);
    }
  }, 30000); // Poll every 30 seconds
}
```

**5. Alert Routes: `/server/src/routes/alerts.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "../db/client";
import { snoozeAlert } from "../services/alerting";

const router = Router();
router.use(requireAuth);

// List user's alerts
router.get("/", async (req, res, next) => {
  try {
    const alerts = await db.alert.findMany({
      where: { userId: req.user!.id },
      include: {
        triggers: {
          orderBy: { triggeredAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

// Create alert
router.post("/", async (req, res, next) => {
  try {
    const alert = await db.alert.create({
      data: {
        userId: req.user!.id,
        name: req.body.name,
        hostId: req.body.hostId,
        containerId: req.body.containerId,
        pattern: req.body.pattern,
        threshold: req.body.threshold || 1,
        windowSeconds: req.body.windowSeconds || 60,
        channel: req.body.channel,
        channelConfig: req.body.channelConfig,
      },
    });
    res.status(201).json(alert);
  } catch (error) {
    next(error);
  }
});

// Update alert
router.patch("/:id", async (req, res, next) => {
  try {
    const alert = await db.alert.findUnique({ where: { id: req.params.id } });
    if (!alert || alert.userId !== req.user!.id) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const updated = await db.alert.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Snooze alert
router.post("/:id/snooze", async (req, res, next) => {
  try {
    const { minutes = 60 } = req.body;
    await snoozeAlert(req.params.id, minutes);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Delete alert
router.delete("/:id", async (req, res, next) => {
  try {
    const alert = await db.alert.findUnique({ where: { id: req.params.id } });
    if (!alert || alert.userId !== req.user!.id) {
      return res.status(404).json({ message: "Alert not found" });
    }

    await db.alert.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get alert trigger history
router.get("/:id/history", async (req, res, next) => {
  try {
    const triggers = await db.alertTrigger.findMany({
      where: { alertId: req.params.id },
      orderBy: { triggeredAt: "desc" },
      take: 50,
    });
    res.json({ triggers });
  } catch (error) {
    next(error);
  }
});

export { router as alertsRouter };
```

**6. Start Alert Poller: `/server/src/index.ts`**

```typescript
import { startAlertPoller } from "./jobs/alertPoller";
import { alertsRouter } from "./routes/alerts";

app.use("/api/alerts", alertsRouter);

// Start alert poller after server starts
startAlertPoller();
```

---

#### Frontend Changes

**1. Alert Management Page: `/client/src/pages/Alerts.tsx`**

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Bell, BellOff, Trash2, Clock } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { AlertForm } from "@/components/AlertForm";

export default function Alerts() {
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["/api/alerts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/alerts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`${API_BASE}/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update alert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      const res = await fetch(`${API_BASE}/alerts/${id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) throw new Error("Failed to snooze alert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/alerts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete alert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const alerts = data?.alerts || [];

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Log Alerts</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Alert
        </Button>
      </div>

      <div className="grid gap-4">
        {alerts.map((alert: any) => (
          <Card key={alert.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{alert.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pattern: <code className="bg-muted px-1 rounded">{alert.pattern}</code>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Threshold: {alert.threshold} matches in {alert.windowSeconds}s
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {alert.enabled ? (
                    <Badge variant="default">
                      <Bell className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <BellOff className="h-3 w-3 mr-1" />
                      Disabled
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Switch
                    checked={alert.enabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: alert.id, enabled: checked })
                    }
                  />
                  <span className="text-sm">Enable notifications</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => snoozeMutation.mutate({ id: alert.id, minutes: 60 })}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Snooze 1h
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(alert.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {alert.triggers?.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm font-medium mb-2">Recent Triggers</p>
                  <div className="space-y-2">
                    {alert.triggers.map((trigger: any) => (
                      <div key={trigger.id} className="text-xs">
                        <span className="text-muted-foreground">
                          {new Date(trigger.triggeredAt).toLocaleString()}
                        </span>
                        {" - "}
                        <span>{trigger.matchCount} matches</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {alerts.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No alerts configured. Create one to get started.
            </CardContent>
          </Card>
        )}
      </div>

      {formOpen && (
        <AlertForm
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}
```

**2. Alert Form Component: `/client/src/components/AlertForm.tsx`**

```typescript
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

interface AlertFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlertForm({ open, onOpenChange }: AlertFormProps) {
  const [name, setName] = useState("");
  const [hostId, setHostId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [pattern, setPattern] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [channel, setChannel] = useState("webhook");
  const [webhookUrl, setWebhookUrl] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: hostsData } = useQuery({
    queryKey: ["/api/hosts"],
  });

  const { data: containersData } = useQuery({
    queryKey: hostId ? ["/api/hosts", hostId, "containers"] : [],
    enabled: Boolean(hostId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          hostId,
          containerId,
          pattern,
          threshold,
          windowSeconds,
          channel,
          channelConfig: { url: webhookUrl },
        }),
      });

      if (!res.ok) throw new Error("Failed to create alert");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Alert created" });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create alert", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Alert Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="High error rate"
            />
          </div>

          <div>
            <Label htmlFor="host">Host</Label>
            <Select value={hostId} onValueChange={setHostId}>
              <SelectTrigger id="host">
                <SelectValue placeholder="Select host" />
              </SelectTrigger>
              <SelectContent>
                {hostsData?.map((host: any) => (
                  <SelectItem key={host.id} value={host.id}>
                    {host.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="container">Container</Label>
            <Select value={containerId} onValueChange={setContainerId}>
              <SelectTrigger id="container">
                <SelectValue placeholder="Select container" />
              </SelectTrigger>
              <SelectContent>
                {containersData?.map((container: any) => (
                  <SelectItem key={container.id} value={container.id}>
                    {container.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="pattern">Log Pattern</Label>
            <Input
              id="pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="ERROR|FATAL|OutOfMemory"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Regex pattern to match in logs
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="threshold">Threshold</Label>
              <Input
                id="threshold"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                min={1}
              />
            </div>
            <div>
              <Label htmlFor="window">Window (seconds)</Label>
              <Input
                id="window"
                type="number"
                value={windowSeconds}
                onChange={(e) => setWindowSeconds(parseInt(e.target.value))}
                min={10}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="channel">Notification Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email (coming soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel === "webhook" && (
            <div>
              <Label htmlFor="webhook">Webhook URL</Label>
              <Input
                id="webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name || !pattern || !containerId || createMutation.isPending}
          >
            Create Alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**3. Add Route: `/client/src/App.tsx`**

```typescript
import Alerts from "@/pages/Alerts";

<Route path="/alerts" component={Alerts} />
```

**4. Add Navigation Link: `/client/src/components/Navbar.tsx`**

```typescript
<Link href="/alerts">
  <Button variant="ghost">
    <Bell className="h-4 w-4 mr-2" />
    Alerts
  </Button>
</Link>
```

---

### Testing Plan

```typescript
// /server/tests/alerts.spec.ts
describe("Alerts System", () => {
  it("should create alert with threshold", async () => {
    const res = await request(app)
      .post("/api/alerts")
      .set("Cookie", userCookie)
      .send({
        name: "High error rate",
        hostId: "piapps",
        containerId: "test-container",
        pattern: "ERROR",
        threshold: 10,
        windowSeconds: 60,
        channel: "webhook",
        channelConfig: { url: "https://webhook.site/test" },
      });

    expect(res.status).toBe(201);
    expect(res.body.threshold).toBe(10);
  });

  it("should trigger alert when threshold exceeded", async () => {
    const alert = await createAlert({
      pattern: "ERROR",
      threshold: 5,
      windowSeconds: 60,
    });

    // Simulate 6 error logs
    await generateLogs("test-container", "ERROR", 6);

    const evaluation = await evaluateAlert(alert.id);
    expect(evaluation.matched).toBe(true);
    expect(evaluation.matchCount).toBeGreaterThanOrEqual(5);
  });

  it("should snooze alert for specified duration", async () => {
    const alert = await createAlert();
    
    await request(app)
      .post(`/api/alerts/${alert.id}/snooze`)
      .set("Cookie", userCookie)
      .send({ minutes: 30 });

    const updated = await db.alert.findUnique({ where: { id: alert.id } });
    expect(updated.snoozeUntil).toBeTruthy();
  });
});
```

---

### Acceptance Criteria

- [ ] Users can create alerts with pattern/threshold/window
- [ ] Alerts evaluate every 30 seconds
- [ ] Webhook notifications sent on trigger
- [ ] Alert history shows past triggers
- [ ] Users can enable/disable alerts
- [ ] Users can snooze alerts for 1h/4h/24h
- [ ] No notification spam (deduplicate within cooldown period)
- [ ] Alert management UI with create/edit/delete

---

## 📅 Implementation Timeline

### Week 1: Foundation & Container Actions
- **Days 1-2:** Database migrations (audit logs, bookmarks, alerts)
- **Days 3-5:** Container actions backend + frontend
- **Days 6-7:** Testing & refinement

### Week 2: Log Bookmarks
- **Days 1-3:** Bookmark backend + frontend
- **Days 4-5:** Deep-linking & sidebar integration
- **Days 6-7:** Testing & UX polish

### Week 3: Alerting System
- **Days 1-3:** Alert backend + polling job
- **Days 4-5:** Alert management UI
- **Days 6-7:** Testing, webhook integration, documentation

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] Run database migrations: `npm run db:push`
- [ ] Test all features in staging environment
- [ ] Update API documentation
- [ ] Create admin user guide
- [ ] Set up monitoring for alert poller

### Deployment
- [ ] Build production bundle: `npm run build`
- [ ] Deploy to PM2: `pm2 restart containeryard`
- [ ] Verify migrations applied successfully
- [ ] Test critical paths (login, container actions, alerts)

### Post-Deployment
- [ ] Monitor error logs for 24 hours
- [ ] Verify alert poller is running
- [ ] Test webhook notifications end-to-end
- [ ] Gather user feedback

---

## 📊 Success Metrics

Track these KPIs post-launch:
- **Adoption:** % of users creating alerts (target: 40%)
- **Engagement:** Avg bookmarks per user (target: 5+)
- **Reliability:** Alert evaluation latency (target: <10s)
- **Error Rate:** Container action failures (target: <1%)

---

## 🔒 Security Considerations

1. **RBAC:** All container actions require ADMIN role
2. **CSRF:** All POST/PATCH/DELETE requests use CSRF tokens
3. **Input Validation:** Validate all alert patterns for regex safety
4. **Rate Limiting:** Limit alert creations to 100 per user
5. **Audit Trail:** Log all sensitive actions (start/stop/remove)
6. **Webhook Security:** Validate webhook URLs, add signature verification

---

## 📚 Documentation Updates

### User Guide
- How to create/manage alerts
- Webhook payload format
- Bookmark sharing workflow
- Container action permissions

### API Reference
- New endpoints for actions, bookmarks, alerts
- Request/response schemas
- Error codes

### Developer Guide
- Alert polling architecture
- Database schema diagrams
- Testing guidelines

---

## 🎉 Conclusion

This implementation plan provides a comprehensive roadmap for adding three critical features to ContainerYard:

1. **Container Actions** - Full lifecycle management
2. **Log Bookmarks** - Enhanced debugging workflow
3. **Log Pattern Alerts** - Proactive monitoring

Following this plan will transform ContainerYard into a production-grade platform competitive with commercial container management tools while maintaining its clean architecture and developer-first philosophy.

**Estimated Effort:** 120-150 developer hours (3 weeks full-time)

**Dependencies:**
- PostgreSQL database
- Redis (already in use)
- Docker Unix socket access
- SMTP server (for email alerts - future)

**Next Steps:**
1. Review and approve this plan
2. Set up development environment
3. Begin Week 1 implementation
4. Schedule weekly progress reviews

---

*Document Version: 1.0*  
*Last Updated: October 26, 2025*  
*Author: ContainerYard Development Team*
