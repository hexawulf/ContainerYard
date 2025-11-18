import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Info } from "lucide-react";
import type { ContainerSummary, ContainerStats, HostSummary } from "@shared/monitoring";
import { Link } from "wouter";

interface ContainerTableProps {
  containers: ContainerSummary[];
  host: HostSummary | null;
  selectedId: string | null;
  onSelect: (containerId: string) => void;
  statsByContainer: Record<string, ContainerStats | undefined>;
  isLoading?: boolean;
  onLogsClick?: (containerId: string) => void;
  onInspectClick?: (containerId:string) => void;
}

function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function ContainerTable({
  containers,
  host,
  selectedId,
  onSelect,
  statsByContainer,
  isLoading,
  onLogsClick,
  onInspectClick,
}: ContainerTableProps) {
  return (
    <ScrollArea className="h-[520px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Networks</TableHead>
            <TableHead>Ports</TableHead>
            <TableHead className="text-right">CPU</TableHead>
            <TableHead className="text-right">Memory</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                Loading containers…
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && Array.isArray(containers) && containers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                No containers detected.
              </TableCell>
            </TableRow>
          ) : null}
          {Array.isArray(containers) && containers.map((container) => {
            const stats = statsByContainer[container.id];
            const isSelected = container.id === selectedId;
            const networks = Array.isArray(container.networks) && container.networks.length
              ? container.networks.map((net) => net.name).join(", ")
              : "—";
            const ports = Array.isArray(container.ports) && container.ports.length
              ? container.ports
                  .map((port) =>
                    port.publicPort
                      ? `${port.privatePort} → ${port.publicPort}/${port.protocol}`
                      : `${port.privatePort}/${port.protocol}`,
                  )
                  .join(", ")
              : "—";

            return (
              <TableRow
                key={container.id}
                className={isSelected ? "bg-muted/70" : "hover:bg-muted/50 cursor-pointer"}
                onClick={() => onSelect(container.id)}
              >
                <TableCell>
                  <div className="font-medium">{container.name}</div>
                  <div className="text-xs text-muted-foreground">{container.node}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={container.state === "running" ? "default" : "secondary"}>
                    {container.state}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{networks}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{ports}</TableCell>
                <TableCell className="text-right text-sm">{formatPercent(stats?.cpuPercent)}</TableCell>
                <TableCell className="text-right text-sm">{formatPercent(stats?.memoryPercent)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {host && (
                      <Link href={`/hosts/${host.id}/logs`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          title="Host Logs"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                    {onLogsClick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onLogsClick(container.id);
                        }}
                        title="View logs"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {onInspectClick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInspectClick(container.id);
                        }}
                        title="Inspect"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
