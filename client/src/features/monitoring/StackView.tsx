import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getQueryFn } from "@/lib/queryClient";
import { 
  Server, 
  Play, 
  Square, 
  RotateCw, 
  ChevronDown, 
  ChevronRight,
  Activity,
  AlertCircle,
  CheckCircle2,
  Layers
} from "lucide-react";
import type { ContainerSummary } from "@shared/monitoring";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface StackSummary {
  name: string;
  containers: ContainerSummary[];
  containerCount: number;
  runningCount: number;
  stoppedCount: number;
  restartingCount: number;
  pausedCount: number;
  healthStatus: "healthy" | "unhealthy" | "partial" | "unknown";
}

interface StacksResponse {
  stacks: StackSummary[];
  standaloneContainers: ContainerSummary[];
}

interface StackViewProps {
  hostId: string;
  onContainerSelect: (containerId: string) => void;
  onLogsClick: (containerId: string) => void;
  onInspectClick: (containerId: string) => void;
  selectedContainerId?: string | null;
}

function HealthBadge({ status }: { status: StackSummary["healthStatus"] }) {
  const config = {
    healthy: { icon: CheckCircle2, variant: "default" as const, label: "Healthy", className: "" },
    unhealthy: { icon: AlertCircle, variant: "destructive" as const, label: "Unhealthy", className: "" },
    partial: { icon: Activity, variant: "outline" as const, label: "Partial", className: "text-yellow-600 border-yellow-600" },
    unknown: { icon: AlertCircle, variant: "secondary" as const, label: "Unknown", className: "" },
  };

  const { icon: Icon, variant, label, className } = config[status];

  return (
    <Badge variant={variant} className={`gap-1 ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ContainerRow({
  container,
  isSelected,
  onSelect,
  onLogsClick,
  onInspectClick,
}: {
  container: ContainerSummary;
  isSelected: boolean;
  onSelect: () => void;
  onLogsClick: () => void;
  onInspectClick: () => void;
}) {
  const stateColor = {
    running: "text-green-600",
    exited: "text-gray-500",
    restarting: "text-yellow-600",
    paused: "text-blue-600",
  }[container.state] || "text-gray-500";

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
        isSelected ? "bg-accent" : "hover:bg-muted/50"
      }`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{container.name}</span>
          <Badge className={stateColor} variant="outline">
            {container.state}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{container.image}</p>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onLogsClick(); }}>
          Logs
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onInspectClick(); }}>
          Inspect
        </Button>
      </div>
    </div>
  );
}

function StackCard({
  stack,
  onContainerSelect,
  onLogsClick,
  onInspectClick,
  selectedContainerId,
}: {
  stack: StackSummary;
  onContainerSelect: (containerId: string) => void;
  onLogsClick: (containerId: string) => void;
  onInspectClick: (containerId: string) => void;
  selectedContainerId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <Layers className="h-5 w-5" />
              <CardTitle className="text-lg">{stack.name}</CardTitle>
              <HealthBadge status={stack.healthStatus} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" title="Start all">
                <Play className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" title="Stop all">
                <Square className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" title="Restart all">
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground mt-2">
            <span>{stack.containerCount} containers</span>
            <span className="text-green-600">{stack.runningCount} running</span>
            {stack.stoppedCount > 0 && (
              <span className="text-gray-600">{stack.stoppedCount} stopped</span>
            )}
            {stack.restartingCount > 0 && (
              <span className="text-yellow-600">{stack.restartingCount} restarting</span>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <Separator />
          <CardContent className="pt-4 space-y-2">
            {stack.containers.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                isSelected={container.id === selectedContainerId}
                onSelect={() => onContainerSelect(container.id)}
                onLogsClick={() => onLogsClick(container.id)}
                onInspectClick={() => onInspectClick(container.id)}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function StackView({
  hostId,
  onContainerSelect,
  onLogsClick,
  onInspectClick,
  selectedContainerId,
}: StackViewProps) {
  const { data, isLoading, error } = useQuery<StacksResponse>({
    queryKey: ["/api/hosts", hostId, "stacks"],
    queryFn: getQueryFn<StacksResponse>({ on401: "throw" }),
    enabled: Boolean(hostId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading stacks...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">Failed to load stacks</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { stacks, standaloneContainers } = data;

  return (
    <div className="space-y-4">
      {stacks.map((stack) => (
        <StackCard
          key={stack.name}
          stack={stack}
          onContainerSelect={onContainerSelect}
          onLogsClick={onLogsClick}
          onInspectClick={onInspectClick}
          selectedContainerId={selectedContainerId}
        />
      ))}

      {standaloneContainers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" />
              Standalone Containers
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-2">
            {standaloneContainers.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                isSelected={container.id === selectedContainerId}
                onSelect={() => onContainerSelect(container.id)}
                onLogsClick={() => onLogsClick(container.id)}
                onInspectClick={() => onInspectClick(container.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
