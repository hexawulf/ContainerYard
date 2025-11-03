import { Router } from "express";
import { getHost } from "../config/hosts";
import { listContainers as listDockerContainers } from "../services/docker";
import { getCadvisorService } from "../services/cadvisor";
import { groupContainersByStack, getStackByName } from "../models/stacks";
import type { ContainerSummary } from "../models/containers";

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

    const containers = await getAllContainersForHost(req.params.hostId);
    const stack = getStackByName(containers, req.params.name);
    
    if (!stack) {
      return res.status(404).json({ error: "Stack not found" });
    }

    // TODO: Implement bulk action on containers
    // This will need to be added to the docker service
    res.status(501).json({ error: "Bulk actions not yet implemented" });
  } catch (error) {
    next(error);
  }
});

export { router as stacksRouter };
