import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileJson } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

interface HistoricalMetricsProps {
  hostId: string;
  containerId: string;
  containerName: string;
}

interface MetricsData {
  aggregatedAt: string;
  avgCpuPercent: string;
  maxCpuPercent: string;
  avgMemoryPercent: string;
  maxMemoryPercent: string;
  avgMemoryBytes: string;
  maxMemoryBytes: string;
}

interface ChartDataPoint {
  time: string;
  cpuAvg: number;
  cpuMax: number;
  memoryAvg: number;
  memoryMax: number;
}

export function HistoricalMetricsChart({
  hostId,
  containerId,
  containerName,
}: HistoricalMetricsProps) {
  const [timeRange, setTimeRange] = useState<"7" | "30" | "90">("7");
  const [chartType, setChartType] = useState<"line" | "area">("line");
  const { toast } = useToast();

  const { data: metricsData, isLoading, error } = useQuery<MetricsData[]>({
    queryKey: ["/api/hosts", hostId, "containers", containerId, "metrics", "history"],
    queryFn: getQueryFn<MetricsData[]>({ on401: "throw" }),
    enabled: Boolean(hostId && containerId),
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "csv" | "json") => {
      const response = await fetch(
        `/api/hosts/${hostId}/containers/${containerId}/metrics/export/csv?days=${timeRange}&format=${format}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to export ${format?.toUpperCase() || 'DATA'}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metrics-${containerName}-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: (_, format) => {
      toast({
        title: "Success",
        description: `Exported ${format?.toUpperCase() || 'DATA'} successfully`,
      });
    },
    onError: (error, format) => {
      toast({
        title: "Error",
        description: `Failed to export ${format?.toUpperCase() || 'DATA'}: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!metricsData) return [];

    return metricsData
      .filter((metric) => {
        const metricDate = new Date(metric.aggregatedAt);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
        return metricDate >= cutoffDate;
      })
      .map((metric) => ({
        time: new Date(metric.aggregatedAt).toLocaleDateString(),
        cpuAvg: parseFloat(metric.avgCpuPercent),
        cpuMax: parseFloat(metric.maxCpuPercent),
        memoryAvg: parseFloat(metric.avgMemoryPercent),
        memoryMax: parseFloat(metric.maxMemoryPercent),
      }));
  }, [metricsData, timeRange]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historical Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading historical metrics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historical Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-destructive">Failed to load historical metrics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

   if (!Array.isArray(chartData) || !chartData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historical Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No historical data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ChartComponent = chartType === "line" ? LineChart : AreaChart;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Historical Metrics - {containerName}</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate("csv")}
              disabled={exportMutation.isPending}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate("json")}
              disabled={exportMutation.isPending}
            >
              <FileJson className="h-4 w-4 mr-1" />
              Export JSON
            </Button>
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as "7" | "30" | "90")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chartType} onValueChange={(value) => setChartType(value as "line" | "area")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="area">Area Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                  fontSize: "12px",
                }}
              />
              <Legend />
              {chartType === "area" ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="cpuMax"
                    stackId="cpu"
                    stroke="hsl(var(--status-danger))"
                    fill="hsl(var(--status-danger))"
                    fillOpacity={0.25}
                    name="CPU Max %"
                  />
                  <Area
                    type="monotone"
                    dataKey="cpuAvg"
                    stackId="cpu"
                    stroke="hsl(var(--chart-3))"
                    fill="hsl(var(--chart-3))"
                    fillOpacity={0.5}
                    name="CPU Avg %"
                  />
                  <Area
                    type="monotone"
                    dataKey="memoryMax"
                    stackId="memory"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.25}
                    name="Memory Max %"
                  />
                  <Area
                    type="monotone"
                    dataKey="memoryAvg"
                    stackId="memory"
                    stroke="hsl(var(--chart-5))"
                    fill="hsl(var(--chart-5))"
                    fillOpacity={0.5}
                    name="Memory Avg %"
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="cpuAvg"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    name="CPU Avg %"
                  />
                  <Line
                    type="monotone"
                    dataKey="cpuMax"
                    stroke="hsl(var(--status-danger))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="CPU Max %"
                  />
                  <Line
                    type="monotone"
                    dataKey="memoryAvg"
                    stroke="hsl(var(--chart-5))"
                    strokeWidth={2}
                    name="Memory Avg %"
                  />
                  <Line
                    type="monotone"
                    dataKey="memoryMax"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Memory Max %"
                  />
                </>
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
