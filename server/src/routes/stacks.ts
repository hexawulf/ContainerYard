import { Router } from "express";
import { getHost } from "../config/hosts";
import { listContainers as listDockerContainers, performBulkAction, getContainerLogs } from "../services/docker";
import { getCadvisorService } from "../services/cadvisor";
import { groupContainersByStack, getStackByName } from "../models/stacks";
import type { ContainerSummary } from "../models/containers";
import type { ContainerAction } from "@shared/schema";

const router = Router();

// Helper to get all containers from a host
async function getAllContainersForHost(hostId: string): Promise<ContainerSummary[]> {
  const host = getHost(hostId);
  
  if (host.provider === "DOCKER") {
    return await listDockerContainers(host);
  }
  
  const service = getCadvisorService(host);
  return await service.listContainers(host);
}

// Get all stacks for a specific host
router.get("/:hostId/stacks", async (req, res, next) => {
  try {
    const containers = await getAllContainersForHost(req.params.hostId);
    const { stacks, standaloneContainers } = groupContainersByStack(containers);
    res.json({ stacks, standaloneContainers });
  } catch (error) {
    next(error);
  }
});

// Get specific stack by name for a host
router.get("/:hostId/stacks/:name", async (req, res, next) => {
  try {
    const containers = await getAllContainersForHost(req.params.hostId);
    const stack = getStackByName(containers, req.params.name);
    
    if (!stack) {
      return res.status(404).json({ error: "Stack not found" });
    }
    
    res.json(stack);
  } catch (error) {
    next(error);
  }
});

// Bulk action on all containers in a stack
router.post("/:hostId/stacks/:name/action", async (req, res, next) => {
  try {
    const { action } = req.body;
    
    if (!action || !["start", "stop", "restart", "remove"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const host = getHost(req.params.hostId);
    if (host.provider !== "DOCKER") {
      return res.status(501).json({ error: "Bulk actions are only supported for Docker provider" });
    }

    const containers = await getAllContainersForHost(req.params.hostId);
    const stack = getStackByName(containers, req.params.name);
    
    if (!stack) {
      return res.status(404).json({ error: "Stack not found" });
    }

    // Get container IDs for the stack
    const containerIds = stack.containers.map(container => container.id);
    
    if (containerIds.length === 0) {
      return res.json({ success: true, message: "No containers to action" });
    }

    // Perform bulk action
    await performBulkAction(host, containerIds, action as ContainerAction);
    
    res.json({ 
      success: true, 
      message: `Successfully performed ${action} on ${containerIds.length} containers`,
      affectedContainers: containerIds.length
    });
  } catch (error) {
    next(error);
  }
});

// Get stack logs (combined logs from all containers in the stack)
router.get("/:hostId/stacks/:name/logs", async (req, res, next) => {
  try {
    const { tail = 500, since } = req.query;
    
    const host = getHost(req.params.hostId);
    if (host.provider !== "DOCKER") {
      return res.status(501).json({ error: "Stack logs are only supported for Docker provider" });
    }

    const containers = await getAllContainersForHost(req.params.hostId);
    const stack = getStackByName(containers, req.params.name);
    
    if (!stack) {
      return res.status(404).json({ error: "Stack not found" });
    }

    // Get logs from all containers in the stack
    const containerLogs = await Promise.allSettled(
      stack.containers.map(async (container) => {
        try {
          const logs = await getContainerLogs(container.id, {
            tail: Math.floor(Number(tail) / stack.containers.length),
            since: since as string,
          });
          
          // Prefix each log line with container name
          return logs.split('\n')
            .filter(line => line.trim())
            .map(line => `[${container.name}] ${line}`)
            .join('\n');
        } catch (error) {
          console.error(`Failed to get logs for container ${container.name}:`, error);
          return `[${container.name}] Error getting logs: ${error}`;
        }
      })
    );

    // Combine all logs and sort by timestamp
    const allLogs = containerLogs
      .filter(result => result.status === "fulfilled")
      .map(result => (result as PromiseFulfilledResult<string>).value)
      .join('\n')
      .split('\n')
      .filter(line => line.trim())
      .sort((a, b) => {
        // Extract timestamp from log lines (assuming Docker timestamp format)
        const timeA = a.match(/^\[.*?\]\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
        const timeB = b.match(/^\[.*?\]\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
        
        if (!timeA || !timeB) return 0;
        return new Date(timeA[1]).getTime() - new Date(timeB[1]).getTime();
      })
      .slice(-Number(tail)) // Take only the requested number of lines
      .join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.send(allLogs);
  } catch (error) {
    next(error);
  }
});

export { router as stacksRouter };
