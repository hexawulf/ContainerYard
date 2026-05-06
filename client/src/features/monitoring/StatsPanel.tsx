import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ContainerDetail, ContainerStats, HostSummary } from "@shared/monitoring";
import { formatDistanceToNow } from "date-fns";
import { TimelineStrip } from "@/components/TimelineStrip";
import type { StatsDataPoint } from "@shared/schema";

interface StatsPanelProps {
  host: HostSummary | null;
  detail: ContainerDetail | null | undefined;
  statsHistory: ContainerStats[];
  onTimelineClick?: (timestamp: string, metric?: "cpu" | "mem" | "net") => void;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export function StatsPanel({ host, detail, statsHistory, onTimelineClick }: StatsPanelProps) {
  const latestStats = statsHistory.at(-1);

  const timelineData: StatsDataPoint[] = useMemo(
    () =>
      Array.isArray(statsHistory) ? statsHistory.map((item) => ({
        ts: item.timestamp,
        cpuPct: item.cpuPercent,
        memPct: item.memoryPercent,
        netRx: item.networkRx,
        netTx: item.networkTx,
      })) : [],
    [statsHistory],
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Container overview</CardTitle>
        <CardDescription>
          {detail
            ? `${detail.name} • ${host?.nodeLabel ?? ""}`
            : "Select a container to view details"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!detail ? (
          <p className="text-muted-foreground text-sm">Choose a container from the list.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary">{detail.provider}</Badge>
              <Badge variant={detail.state === "running" ? "default" : "secondary"}>
                {detail.state?.toUpperCase() || 'UNKNOWN'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Started {detail.createdAt ? formatDistanceToNow(new Date(detail.createdAt), { addSuffix: true }) : "unknown"}
              </span>
            </div>

            {/* Metric Timeline - New Integration */}
             {timelineData.length > 0 && (
              <div className="border rounded-lg overflow-hidden my-4">
                <div className="bg-muted/50 px-3 py-1 text-[10px] uppercase font-bold text-muted-foreground border-b">
                  Performance Timeline (Click to jump logs)
                </div>
                <TimelineStrip 
                  stats={timelineData} 
                  onTimestampClick={onTimelineClick}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Image</p>
                <p className="text-sm font-medium break-all">{detail.image}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Command</p>
                <p className="text-sm font-medium break-all">{detail.command || "—"}</p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Networks</h3>
                <div className="space-y-2 mt-2">
                  {Array.isArray(detail?.networks) && detail.networks.map((network) => (
                    <div key={network.name} className="text-sm">
                      <div className="font-medium">{network.name}</div>
                      <div className="text-muted-foreground text-xs">{network.ipAddress || "—"}</div>
                    </div>
                  ))}
                   {Array.isArray(detail.networks) && detail.networks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No networks</p>
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Ports</h3>
                <div className="space-y-2 mt-2">
                  {Array.isArray(detail?.ports) && detail.ports.map((port, idx) => (
                    <div key={`${port.privatePort}-${idx}`} className="text-sm">
                      <div className="font-medium">
                        {port.privatePort}
                        {port.publicPort ? ` → ${port.publicPort}` : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">{port.protocol?.toUpperCase() || 'TCP'}</div>
                    </div>
                  ))}
                   {Array.isArray(detail.ports) && detail.ports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No exposed ports</p>
                  ) : null}
                </div>
              </div>
            </div>

            {host?.provider === "CADVISOR_ONLY" && host.dozzleUrl ? (
              <div>
                <a
                  href={host.dozzleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  Open in Dozzle
                </a>
              </div>
            ) : null}

            <Separator />

             {latestStats && (
              <div className="grid gap-4 grid-cols-2 text-xs">
                <div className="space-y-1">
                  <span className="text-muted-foreground uppercase">Mem Usage</span>
                  <p className="font-medium">{formatBytes(latestStats.memoryUsage)} / {formatBytes(latestStats.memoryLimit)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground uppercase">Net I/O</span>
                  <p className="font-medium">RX: {formatBytes(latestStats.networkRx)} | TX: {formatBytes(latestStats.networkTx)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground uppercase">Block I/O</span>
                  <p className="font-medium">R: {formatBytes(latestStats.blockRead)} | W: {formatBytes(latestStats.blockWrite)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
