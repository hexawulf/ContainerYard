import { db } from "../../db";
import { containerRestarts } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
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
        // State changed - check if it's a restart
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

          // Save to database
          try {
            await db.insert(containerRestarts).values({
              hostId: container.hostId,
              containerId: container.id,
              containerName: container.name,
              restartReason: `State changed from ${previousState} to ${currentState}`,
            });
          } catch (error) {
            console.error(`Failed to record restart for ${container.name}:`, error);
          }
        }
      }

      // Update tracked state
      this.trackedContainers.set(containerKey, currentState);
    }

    return restartEvents;
  }

  private isRestartEvent(previousState: string, currentState: string): boolean {
    // Consider these scenarios as restart events:
    // 1. exited -> running (container was restarted)
    // 2. running -> restarting -> running (container restart cycle)
    // 3. paused -> running (container was resumed)
    const restartPatterns = [
      { from: "exited", to: "running" },
      { from: "paused", to: "running" },
      { from: "restarting", to: "running" },
    ];

    return restartPatterns.some(pattern => 
      pattern.from === previousState && pattern.to === currentState
    );
  }

  /**
   * Get restart count for a container in the specified time window
   */
  async getRestartCount(hostId: string, containerId: string, minutes: number): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
      
      const restarts = await db
        .select()
        .from(containerRestarts)
        .where(
          and(
            eq(containerRestarts.hostId, hostId),
            eq(containerRestarts.containerId, containerId),
            gte(containerRestarts.createdAt, cutoffTime)
          )
        );

      return restarts.length;
    } catch (error) {
      console.error(`Failed to get restart count for ${containerId}:`, error);
      return 0;
    }
  }

  /**
   * Clean up old restart records (older than 30 days)
   */
  async cleanupOldRestarts(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      await db
        .delete(containerRestarts)
        .where(gte(containerRestarts.createdAt, cutoffTime));

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
    try {
      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
      
      const restarts = await db
        .select()
        .from(containerRestarts)
        .where(
          and(
            eq(containerRestarts.hostId, hostId),
            gte(containerRestarts.createdAt, cutoffTime)
          )
        )
        .orderBy(containerRestarts.createdAt);

      // Group by container and count
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

// Singleton instance
export const restartTracker = new RestartTrackerService();
