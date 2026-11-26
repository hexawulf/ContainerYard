import { prisma } from "../db/client";
import type { ContainerSummary } from "../models/containers";

interface RestartEvent {
  hostId: string;
  containerId: string;
  containerName: string;
  timestamp: Date;
  previousState: string;
  currentState: string;
}

class RestartTrackerService {
  private trackedContainers = new Map<string, string>(); // containerKey -> state

  /**
   * Track container state changes and record restart events
   */
  async trackContainers(containers: ContainerSummary[]): Promise<RestartEvent[]> {
    const restartEvents: RestartEvent[] = [];
    const currentTime = new Date();

    for (const container of containers) {
      const containerKey = `${container.hostId}:${container.id}`;
      const previousState = this.trackedContainers.get(containerKey);
      const currentState = container.state;

      if (previousState && previousState !== currentState) {
        if (this.isRestartEvent(previousState, currentState)) {
          const event: RestartEvent = {
            hostId: container.hostId,
            containerId: container.id,
            containerName: container.name,
            timestamp: currentTime,
            previousState,
            currentState,
          };

          restartEvents.push(event);
          await this.saveRestartEvent(event);
        }
      }

      this.trackedContainers.set(containerKey, currentState);
    }

    return restartEvents;
  }

  private async saveRestartEvent(event: RestartEvent): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.containerRestart.create({
        data: {
          hostId: event.hostId,
          containerId: event.containerId,
          containerName: event.containerName,
          restartReason: `State changed from ${event.previousState} to ${event.currentState}`,
        },
      });
    } catch (error) {
      console.error(`Failed to record restart for ${event.containerName}:`, error);
    }
  }

  private isRestartEvent(previousState: string, currentState: string): boolean {
    const restartPatterns = [
      { from: "exited", to: "running" },
      { from: "paused", to: "running" },
      { from: "restarting", to: "running" },
    ];

    return restartPatterns.some(
      (pattern) => pattern.from === previousState && pattern.to === currentState,
    );
  }

  /**
   * Get restart count for a container in the specified time window
   */
  async getRestartCount(hostId: string, containerId: string, minutes: number): Promise<number> {
    if (!prisma) return 0;
    try {
      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
      return await prisma.containerRestart.count({
        where: {
          hostId,
          containerId,
          createdAt: { gte: cutoffTime },
        },
      });
    } catch (error) {
      console.error(`Failed to get restart count for ${containerId}:`, error);
      return 0;
    }
  }

  /**
   * Clean up old restart records (older than 30 days)
   */
  async cleanupOldRestarts(): Promise<void> {
    if (!prisma) return;
    try {
      const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.containerRestart.deleteMany({
        where: { createdAt: { lte: cutoffTime } },
      });
      console.log("Cleaned up old restart records");
    } catch (error) {
      console.error("Failed to cleanup old restart records:", error);
    }
  }

  /**
   * Get containers with recent restarts
   */
  async getContainersWithRecentRestarts(hostId: string, minutes: number): Promise<Array<{
    containerId: string;
    containerName: string;
    restartCount: number;
    lastRestart: Date;
  }>> {
    if (!prisma) return [];
    try {
      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
      const restarts = await prisma.containerRestart.findMany({
        where: {
          hostId,
          createdAt: { gte: cutoffTime },
        },
        orderBy: { createdAt: "asc" },
      });

      const containerMap = new Map<string, {
        containerId: string;
        containerName: string;
        restartCount: number;
        lastRestart: Date;
      }>();

      for (const restart of restarts) {
        const key = restart.containerId;
        const existing = containerMap.get(key);

        if (existing) {
          existing.restartCount++;
          if (restart.createdAt > existing.lastRestart) {
            existing.lastRestart = restart.createdAt;
          }
        } else {
          containerMap.set(key, {
            containerId: restart.containerId,
            containerName: restart.containerName,
            restartCount: 1,
            lastRestart: restart.createdAt,
          });
        }
      }

      return Array.from(containerMap.values())
        .sort((a, b) => b.restartCount - a.restartCount);
    } catch (error) {
      console.error(`Failed to get containers with recent restarts for host ${hostId}:`, error);
      return [];
    }
  }
}

export const restartTracker = new RestartTrackerService();
