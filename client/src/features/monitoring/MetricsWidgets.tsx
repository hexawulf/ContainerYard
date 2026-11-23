import type { LucideIcon } from 'lucide-react';
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getQueryFn } from "@/lib/queryClient";
import { Activity, MemoryStick, Cpu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricsWidgetsProps {
  hostId: string;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

interface TopConsumer {
  containerId: string;
  containerName: string;
  displayValue: string;
}

function WidgetCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2.5 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function TopConsumersList({ data, type }: { data: TopConsumer[]; type: "cpu" | "memory" }) {
  if (!Array.isArray(data) || !data.length) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.map((item, index) => (
        <div key={item.containerId} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-mono shrink-0">
              #{index + 1}
            </Badge>
            <span className="text-sm font-medium truncate" title={item.containerName}>{item.containerName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {type === "cpu" ? (
              <Cpu className="h-3.5 w-3.5 text-[hsl(var(--chart-3))]" />
            ) : (
              <MemoryStick className="h-3.5 w-3.5 text-[hsl(var(--chart-1))]" />
            )}
            <span className="text-sm font-semibold font-mono tabular-nums">
              {item.displayValue}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatKpi({
  title,
  value,
  valueClassName = "text-foreground",
}: {
  title: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="p-2.5 bg-muted/50 border border-border/60 rounded-lg">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
      <p className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}

interface HostSummaryData {
  totalCpu: number;
  memUsed: number;
  topCpu: Array<{ name: string; cpuPct: number }>;
  topMem: Array<{ name: string; memBytes: number }>;
  containers: number;
}

export function MetricsWidgets({ hostId }: MetricsWidgetsProps) {
  const { data: summaryData, isLoading: summaryLoading } = useQuery<HostSummaryData>({
    queryKey: ["/api/hosts", hostId, "summary"],
    queryFn: getQueryFn<HostSummaryData>({ on401: "throw" }),
    enabled: Boolean(hostId),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });

  const topCpuData = useMemo(() => {
    if (!summaryData?.topCpu) return [];
    return summaryData.topCpu.map((item, index) => ({
      containerId: `cpu-${index}`,
      containerName: item.name,
      displayValue: `${item.cpuPct.toFixed(1)}%`,
    }));
  }, [summaryData]);

  const topMemoryData = useMemo(() => {
    if (!summaryData?.topMem) return [];
    return summaryData.topMem.map((item, index) => ({
      containerId: `mem-${index}`,
      containerName: item.name,
      displayValue: formatBytes(item.memBytes),
    }));
  }, [summaryData]);

  if (summaryLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2.5 pt-4 px-4">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Skeleton className="h-[120px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cpuValueClass =
    summaryData && summaryData.totalCpu >= 80
      ? "text-status-danger"
      : summaryData && summaryData.totalCpu >= 60
        ? "text-status-warning"
        : "text-foreground";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <WidgetCard title="Top CPU Consumers" icon={Cpu}>
        <TopConsumersList data={topCpuData} type="cpu" />
      </WidgetCard>

      <WidgetCard title="Top Memory Consumers" icon={MemoryStick}>
        <TopConsumersList data={topMemoryData} type="memory" />
      </WidgetCard>

      <WidgetCard title="Overall Statistics" icon={Activity}>
        <div className="space-y-2.5">
          {summaryData ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <StatKpi
                  title="Avg CPU"
                  value={`${summaryData.totalCpu.toFixed(1)}%`}
                  valueClassName={cpuValueClass}
                />
                <StatKpi
                  title="Memory Used"
                  value={formatBytes(summaryData.memUsed)}
                />
              </div>
              <div className="pt-2 border-t space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Running containers</span>
                  <span className="font-semibold font-mono tabular-nums">{summaryData.containers}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Top CPU</span>
                  <span className="font-semibold font-mono tabular-nums">{summaryData.topCpu?.[0]?.cpuPct.toFixed(1) ?? 0}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Top Memory</span>
                  <span className="font-semibold font-mono tabular-nums">{formatBytes(summaryData.topMem?.[0]?.memBytes ?? 0)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No data available
            </div>
          )}
        </div>
      </WidgetCard>
    </div>
  );
}
