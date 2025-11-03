import type { ContainerSummary } from "./containers";

export interface StackSummary {
  name: string;
  containers: ContainerSummary[];
  containerCount: number;
  runningCount: number;
  stoppedCount: number;
  restartingCount: number;
  pausedCount: number;
  healthStatus: "healthy" | "unhealthy" | "partial" | "unknown";
}

export function groupContainersByStack(containers: ContainerSummary[]): {
  stacks: StackSummary[];
  standaloneContainers: ContainerSummary[];
} {
  const stackMap = new Map<string, ContainerSummary[]>();
  const standaloneContainers: ContainerSummary[] = [];

  // Group containers by compose project
  for (const container of containers) {
    if (container.composeProject) {
      const existing = stackMap.get(container.composeProject) || [];
      existing.push(container);
      stackMap.set(container.composeProject, existing);
    } else {
      standaloneContainers.push(container);
    }
  }

  // Create stack summaries
  const stacks: StackSummary[] = [];
  for (const [name, stackContainers] of Array.from(stackMap.entries())) {
    const runningCount = stackContainers.filter((c: ContainerSummary) => c.state === "running").length;
    const stoppedCount = stackContainers.filter((c: ContainerSummary) => c.state === "exited").length;
    const restartingCount = stackContainers.filter((c: ContainerSummary) => c.state === "restarting").length;
    const pausedCount = stackContainers.filter((c: ContainerSummary) => c.state === "paused").length;
    
    let healthStatus: "healthy" | "unhealthy" | "partial" | "unknown" = "unknown";
    if (runningCount === stackContainers.length) {
      healthStatus = "healthy";
    } else if (runningCount === 0) {
      healthStatus = "unhealthy";
    } else {
      healthStatus = "partial";
    }

    stacks.push({
      name,
      containers: stackContainers,
      containerCount: stackContainers.length,
      runningCount,
      stoppedCount,
      restartingCount,
      pausedCount,
      healthStatus,
    });
  }

  return { stacks, standaloneContainers };
}

export function getStackByName(
  containers: ContainerSummary[],
  stackName: string
): StackSummary | undefined {
  const { stacks } = groupContainersByStack(containers);
  return stacks.find((stack) => stack.name === stackName);
}
