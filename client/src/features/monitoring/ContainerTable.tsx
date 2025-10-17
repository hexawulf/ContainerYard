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
import type { ContainerSummary, ContainerStats, HostSummary } from "@shared/monitoring";

interface ContainerTableProps {
  containers: ContainerSummary[];
  host: HostSummary | null;
  selectedId: string | null;
  onSelect: (containerId: string) => void;
  statsByContainer: Record<string, ContainerStats | undefined>;
  isLoading?: boolean;
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
            {host?.provider === "CADVISOR_ONLY" && host.dozzleUrl ? <TableHead>Dozzle</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={host?.provider === "CADVISOR_ONLY" && host.dozzleUrl ? 7 : 6} className="text-center text-sm text-muted-foreground py-8">
                Loading containers…
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && containers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={host?.provider === "CADVISOR_ONLY" && host.dozzleUrl ? 7 : 6} className="text-center text-sm text-muted-foreground py-8">
                No containers detected.
              </TableCell>
            </TableRow>
          ) : null}
          {containers.map((container) => {
            const stats = statsByContainer[container.id];
            const isSelected = container.id === selectedId;
            const networks = container.networks.length
              ? container.networks.map((net) => net.name).join(", ")
              : "—";
            const ports = container.ports.length
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
                {host?.provider === "CADVISOR_ONLY" && host.dozzleUrl ? (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(host.dozzleUrl || "", "_blank", "noopener,noreferrer");
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
