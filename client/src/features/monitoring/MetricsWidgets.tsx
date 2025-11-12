import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getQueryFn } from "@/lib/queryClient";
import { TrendingUp, TrendingDown, Activity, MemoryStick, Cpu } from "lucide-react";
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
  avgCpuPercent: string;
  avgMemoryPercent: string;
}

interface MetricsSummary {
  containerId: string;
  containerName: string;
  avgCpuPercent: string;
  maxCpuPercent: string;
  avgMemoryPercent: string;
  maxMemoryPercent: string;
  dataPoints: number;
}

function WidgetCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TopConsumersList({ data, type }: { data: TopConsumer[]; type: "cpu" | "memory" }) {
  if (!data.length) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={item.containerId} className="flex items-center justify-between py-2 border-b last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-xs">
              #{index + 1}
            </Badge>
            <span className="text-sm font-medium truncate">{item.containerName}</span>
          </div>
          <div className="flex items-center gap-1">
            {type === "cpu" ? (
              <Cpu className="h-3 w-3 text-orange-500" />
            ) : (
              <MemoryStick className="h-3 w-3 text-blue-500" />
            )}
            <span className="text-sm font-semibold">
              {type === "cpu" ? item.avgCpuPercent : item.avgMemoryPercent}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthIndicator({ title, value, trend }: { title: string; value: string; trend: "up" | "down" | "stable" }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-600";
  
  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <TrendIcon className={`h-5 w-5 ${trendColor}`} />
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
    refetchIntervalInBackground: true,
  });

  const topCpuData = useMemo(() => {
    if (!summaryData?.topCpu) return [];
    return summaryData.topCpu.map((item, index) => ({
      containerId: `cpu-${index}`,
      containerName: item.name,
      avgCpuPercent: item.cpuPct.toFixed(1),
      avgMemoryPercent: "0",
    }));
  }, [summaryData]);

  const topMemoryData = useMemo(() => {
    if (!summaryData?.topMem) return [];
    return summaryData.topMem.map((item, index) => ({
      containerId: `mem-${index}`,
      containerName: item.name,
      avgCpuPercent: "0",
      avgMemoryPercent: (item.memBytes / 1024 / 1024).toFixed(1), // Convert to MB for display
    }));
  }, [summaryData]);

  if (summaryLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <WidgetCard title="Top CPU Consumers" icon={Cpu}>
        <TopConsumersList data={topCpuData || []} type="cpu" />
      </WidgetCard>

      <WidgetCard title="Top Memory Consumers" icon={MemoryStick}>
        <TopConsumersList data={topMemoryData || []} type="memory" />
      </WidgetCard>

      <WidgetCard title="Overall Statistics" icon={Activity}>
        <div className="space-y-3">
          {summaryData ? (
            <>
              <HealthIndicator 
                title="Total CPU" 
                value={`${summaryData.totalCpu.toFixed(1)}%`} 
                trend={summaryData.totalCpu > 50 ? "up" : "down"} 
              />
              <HealthIndicator 
                title="Memory Used" 
                value={formatBytes(summaryData.memUsed)} 
                trend={summaryData.memUsed > 1024 * 1024 * 1024 ? "up" : "down"} 
              />
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Containers</span>
                  <span className="font-semibold">{summaryData.containers}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Top CPU</span>
                  <span className="font-semibold">{summaryData.topCpu?.[0]?.cpuPct.toFixed(1) ?? 0}%</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Top Memory</span>
                  <span className="font-semibold">{formatBytes(summaryData.topMem?.[0]?.memBytes ?? 0)}</span>
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
