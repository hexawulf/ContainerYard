import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ContainerDetail, ContainerStats, HostSummary } from "@shared/monitoring";
import { formatDistanceToNow } from "date-fns";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

interface StatsPanelProps {
  host: HostSummary | null;
  detail: ContainerDetail | null | undefined;
  statsHistory: ContainerStats[];
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export function StatsPanel({ host, detail, statsHistory }: StatsPanelProps) {
  const latestStats = statsHistory.at(-1);

  const cpuData = useMemo(
    () =>
      statsHistory.map((item, index) => ({
        index,
        cpu: Number(item.cpuPercent.toFixed(2)),
      })),
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
                  {detail.networks.map((network) => (
                    <div key={network.name} className="text-sm">
                      <div className="font-medium">{network.name}</div>
                      <div className="text-muted-foreground text-xs">{network.ipAddress || "—"}</div>
                    </div>
                  ))}
                  {detail.networks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No networks</p>
                  ) : null}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Ports</h3>
                <div className="space-y-2 mt-2">
                  {detail.ports.map((port, idx) => (
                    <div key={`${port.privatePort}-${idx}`} className="text-sm">
                      <div className="font-medium">
                        {port.privatePort}
                        {port.publicPort ? ` → ${port.publicPort}` : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">{port.protocol?.toUpperCase() || 'TCP'}</div>
                    </div>
                  ))}
                  {detail.ports.length === 0 ? (
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

            {statsHistory.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">CPU</span>
                    <Badge variant="secondary">{formatPercent(latestStats?.cpuPercent)}</Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={40}>
                    <LineChart data={cpuData} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                      <YAxis hide domain={[0, 100]} />
                      <Line type="monotone" dataKey="cpu" strokeWidth={2} dot={false} stroke="#22c55e" isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Memory</span>
                    <Badge variant="secondary">{formatPercent(latestStats?.memoryPercent)}</Badge>
                  </div>
                  <div className="border rounded-md p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usage</span>
                      <span>{formatBytes(latestStats?.memoryUsage)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Limit</span>
                      <span>{formatBytes(latestStats?.memoryLimit)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Network TX</span>
                    <Badge variant="outline">{formatBytes(latestStats?.networkTx)}</Badge>
                  </div>
                  <div className="border rounded-md p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RX</span>
                      <span>{formatBytes(latestStats?.networkRx)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TX</span>
                      <span>{formatBytes(latestStats?.networkTx)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Block I/O</span>
                    <Badge variant="outline">{formatBytes(latestStats?.blockRead)}</Badge>
                  </div>
                  <div className="border rounded-md p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Read</span>
                      <span>{formatBytes(latestStats?.blockRead)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Write</span>
                      <span>{formatBytes(latestStats?.blockWrite)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
