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

export function MetricsWidgets({ hostId }: MetricsWidgetsProps) {
  const { data: topCpuData, isLoading: topCpuLoading } = useQuery<TopConsumer[]>({
    queryKey: ["/api/hosts", hostId, "metrics", "top-cpu"],
    queryFn: getQueryFn<TopConsumer[]>({ on401: "throw" }),
    enabled: Boolean(hostId),
  });

  const { data: topMemoryData, isLoading: topMemoryLoading } = useQuery<TopConsumer[]>({
    queryKey: ["/api/hosts", hostId, "metrics", "top-memory"],
    queryFn: getQueryFn<TopConsumer[]>({ on401: "throw" }),
    enabled: Boolean(hostId),
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery<MetricsSummary[]>({
    queryKey: ["/api/hosts", hostId, "metrics", "summary"],
    queryFn: getQueryFn<MetricsSummary[]>({ on401: "throw" }),
    enabled: Boolean(hostId),
  });

  const overallStats = useMemo(() => {
    if (!summaryData) return null;

    const totalContainers = summaryData.length;
    const avgCpu = summaryData.reduce((sum, item) => sum + parseFloat(item.avgCpuPercent), 0) / totalContainers;
    const avgMemory = summaryData.reduce((sum, item) => sum + parseFloat(item.avgMemoryPercent), 0) / totalContainers;
    const maxCpu = Math.max(...summaryData.map(item => parseFloat(item.maxCpuPercent)));
    const maxMemory = Math.max(...summaryData.map(item => parseFloat(item.maxMemoryPercent)));

    return {
      totalContainers,
      avgCpu: avgCpu.toFixed(1),
      avgMemory: avgMemory.toFixed(1),
      maxCpu: maxCpu.toFixed(1),
      maxMemory: maxMemory.toFixed(1),
    };
  }, [summaryData]);

  if (topCpuLoading || topMemoryLoading || summaryLoading) {
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
          {overallStats ? (
            <>
              <HealthIndicator 
                title="Average CPU" 
                value={`${overallStats.avgCpu}%`} 
                trend={parseFloat(overallStats.avgCpu) > 50 ? "up" : "down"} 
              />
              <HealthIndicator 
                title="Average Memory" 
                value={`${overallStats.avgMemory}%`} 
                trend={parseFloat(overallStats.avgMemory) > 50 ? "up" : "down"} 
              />
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Containers</span>
                  <span className="font-semibold">{overallStats.totalContainers}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Peak CPU</span>
                  <span className="font-semibold">{overallStats.maxCpu}%</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Peak Memory</span>
                  <span className="font-semibold">{overallStats.maxMemory}%</span>
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
