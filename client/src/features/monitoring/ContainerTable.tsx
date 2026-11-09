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
import { ContainerActions } from "./ContainerActions";
import { useAuth } from "@/components/AuthGate";

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

function stateBadgeClass(state?: string) {
  switch (state) {
    case "running":
      return "bg-status-running/10 text-status-running border-status-running/30";
    case "restarting":
      return "bg-status-warning/10 text-status-warning border-status-warning/30";
    case "paused":
      return "bg-status-info/10 text-status-info border-status-info/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
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
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  return (
    <ScrollArea className="h-[520px] w-full [&>div>div]:!block">
      <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 h-9">Name</TableHead>
            <TableHead className="hidden sm:table-cell px-2 h-9">Status</TableHead>
            <TableHead className="hidden 2xl:table-cell px-2 h-9">Networks</TableHead>
            <TableHead className="hidden xl:table-cell px-2 h-9">Ports</TableHead>
            <TableHead className="hidden sm:table-cell px-2 h-9 text-right">CPU</TableHead>
            <TableHead className="hidden sm:table-cell px-2 h-9 text-right">Memory</TableHead>
            <TableHead className="px-3 h-9 text-right">Actions</TableHead>
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
                className={isSelected ? "bg-accent/70" : "hover:bg-muted/50 cursor-pointer"}
                onClick={() => onSelect(container.id)}
              >
                <TableCell className="px-3 py-2.5 max-w-[140px] sm:max-w-[200px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`sm:hidden h-2 w-2 rounded-full shrink-0 ${
                        container.state === "running"
                          ? "bg-status-running"
                          : container.state === "restarting"
                          ? "bg-status-warning"
                          : "bg-muted-foreground"
                      }`}
                      title={container.state}
                    />
                    <div className="font-medium text-sm truncate" title={container.name}>{container.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {container.node}
                    <span className="sm:hidden ml-1.5 font-mono">
                      • {formatPercent(stats?.cpuPercent)} CPU
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell px-2 py-2.5">
                  <Badge variant="outline" className={`font-medium text-[11px] px-1.5 py-0 ${stateBadgeClass(container.state)}`}>
                    {container.state}
                  </Badge>
                </TableCell>
                <TableCell className="hidden 2xl:table-cell px-2 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{networks}</TableCell>
                <TableCell className="hidden xl:table-cell px-2 py-2.5 text-xs font-mono text-muted-foreground max-w-[140px] truncate">{ports}</TableCell>
                <TableCell className="hidden sm:table-cell px-2 py-2.5 text-right text-xs font-mono tabular-nums">{formatPercent(stats?.cpuPercent)}</TableCell>
                <TableCell className="hidden sm:table-cell px-2 py-2.5 text-right text-xs font-mono tabular-nums">{formatPercent(stats?.memoryPercent)}</TableCell>
                <TableCell className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <ContainerActions container={container} host={host} />
                    {host && isAdmin && (
                      <Link href={`/hosts/${host.id}/logs`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 hidden sm:inline-flex"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          title="Host Logs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    )}
                    {onLogsClick && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          onLogsClick(container.id);
                        }}
                        title="View logs"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {onInspectClick && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInspectClick(container.id);
                        }}
                        title="Inspect"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </ScrollArea>
  );
}
