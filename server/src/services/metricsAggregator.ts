import { db } from "../../db";
import { containerMetricsHourly } from "@shared/schema";
import { listContainers as listDockerContainers, getContainerStats as getDockerContainerStats } from "./docker";
import { getCadvisorService } from "./cadvisor";
import { getHost, listHosts } from "../config/hosts";
import type { ContainerSummary, ContainerStats } from "../models/containers";

interface MetricsAccumulator {
  hostId: string;
  containerId: string;
  containerName: string;
  cpuSamples: number[];
  memorySamples: number[];
  memoryBytesSamples: number[];
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  sampleCount: number;
}

class MetricsAggregatorService {
  private interval: NodeJS.Timeout | null = null;
  private aggregationIntervalMs = 60 * 60 * 1000; // 1 hour
  private metricsAccumulators = new Map<string, MetricsAccumulator>();

  async start() {
    if (this.interval) {
      console.log("Metrics aggregator already running");
      return;
    }

    console.log("Starting metrics aggregator service...");
    
    // Start collecting metrics every minute
    this.startMetricsCollection();
    
    // Aggregate and save every hour
    this.interval = setInterval(() => {
      this.aggregateAndSave().catch((error) => {
        console.error("Error aggregating metrics:", error);
      });
    }, this.aggregationIntervalMs);

    console.log("Metrics aggregator started");
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("Metrics aggregator stopped");
    }
  }

  private startMetricsCollection() {
    // Collect metrics every minute
    setInterval(() => {
      this.collectMetrics().catch((error) => {
        console.error("Error collecting metrics:", error);
      });
    }, 60 * 1000); // 1 minute

    // Run initial collection
    this.collectMetrics().catch((error) => {
      console.error("Error in initial metrics collection:", error);
    });
  }

  private async collectMetrics() {
    try {
      const hostSummaries = listHosts();
      
      for (const hostSummary of hostSummaries) {
        try {
          const host = getHost(hostSummary.id);
          let containers: ContainerSummary[] = [];
          
          if (host.provider === "DOCKER") {
            containers = await listDockerContainers(host);
          } else {
            const service = getCadvisorService(host);
            if (!service) {
              console.warn(`cAdvisor service unavailable for host ${host.id}`);
              containers = [];
            } else {
              containers = await service.listContainers(host);
            }
          }

          // Only track running containers
          const runningContainers = containers.filter((c) => c.state === "running");

          for (const container of runningContainers) {
            try {
              let stats: ContainerStats | null = null;
              
              if (host.provider === "DOCKER") {
                stats = await getDockerContainerStats(host, container.id);
              } else {
                const service = getCadvisorService(host);
                if (!service) {
                  console.warn(`cAdvisor service unavailable for host ${host.id}`);
                  stats = null;
                } else {
                  stats = await service.getStats(host, container.id);
                }
              }

              if (stats) {
                this.accumulateMetrics(container, stats);
              }
            } catch (error) {
              console.error(`Error collecting stats for container ${container.id}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error collecting metrics from host ${hostSummary.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in collectMetrics:", error);
    }
  }

  private accumulateMetrics(container: ContainerSummary, stats: ContainerStats) {
    const key = `${container.hostId}:${container.id}`;
    
    if (!this.metricsAccumulators.has(key)) {
      this.metricsAccumulators.set(key, {
        hostId: container.hostId,
        containerId: container.id,
        containerName: container.name,
        cpuSamples: [],
        memorySamples: [],
        memoryBytesSamples: [],
        networkRx: 0,
        networkTx: 0,
        blockRead: 0,
        blockWrite: 0,
        sampleCount: 0,
      });
    }

    const accumulator = this.metricsAccumulators.get(key)!;
    accumulator.cpuSamples.push(stats.cpuPercent);
    accumulator.memorySamples.push(stats.memoryPercent);
    accumulator.memoryBytesSamples.push(stats.memoryUsage);
    accumulator.networkRx = stats.networkRx; // Keep latest value
    accumulator.networkTx = stats.networkTx;
    accumulator.blockRead = stats.blockRead;
    accumulator.blockWrite = stats.blockWrite;
    accumulator.sampleCount++;
  }

  private async aggregateAndSave() {
    try {
      const now = new Date();
      const aggregatedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

      console.log(`Aggregating metrics for ${this.metricsAccumulators.size} containers...`);

      for (const [key, accumulator] of this.metricsAccumulators.entries()) {
        if (accumulator.sampleCount === 0) {
          continue;
        }

        try {
          const avgCpu = this.average(accumulator.cpuSamples);
          const maxCpu = Math.max(...accumulator.cpuSamples);
          const avgMemory = this.average(accumulator.memorySamples);
          const maxMemory = Math.max(...accumulator.memorySamples);
          const avgMemoryBytes = this.average(accumulator.memoryBytesSamples);
          const maxMemoryBytes = Math.max(...accumulator.memoryBytesSamples);

          await db.insert(containerMetricsHourly).values({
            hostId: accumulator.hostId,
            containerId: accumulator.containerId,
            containerName: accumulator.containerName,
            aggregatedAt,
            avgCpuPercent: avgCpu.toFixed(2),
            maxCpuPercent: maxCpu.toFixed(2),
            avgMemoryPercent: avgMemory.toFixed(2),
            maxMemoryPercent: maxMemory.toFixed(2),
            avgMemoryBytes: Math.round(avgMemoryBytes).toString(),
            maxMemoryBytes: Math.round(maxMemoryBytes).toString(),
            totalNetworkRx: accumulator.networkRx.toString(),
            totalNetworkTx: accumulator.networkTx.toString(),
            totalBlockRead: accumulator.blockRead.toString(),
            totalBlockWrite: accumulator.blockWrite.toString(),
            sampleCount: accumulator.sampleCount as any,
          });

          console.log(`Saved hourly metrics for ${accumulator.containerName}`);
        } catch (error) {
          console.error(`Error saving metrics for container ${key}:`, error);
        }
      }

      // Clear accumulators for next hour
      this.metricsAccumulators.clear();
      console.log("Metrics aggregation completed");
    } catch (error) {
      console.error("Error in aggregateAndSave:", error);
    }
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
}

// Singleton instance
export const metricsAggregator = new MetricsAggregatorService();
