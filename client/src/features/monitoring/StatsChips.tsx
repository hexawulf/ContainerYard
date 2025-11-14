import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { NormalizedStats } from "@shared/monitoring";

interface StatsChipsProps {
  statsHistory: NormalizedStats[];
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${(bytesPerSec / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface ChipProps {
  label: string;
  value: string;
  data: number[];
  color: string;
  tooltip?: string;
}

function StatChip({ label, value, data, color, tooltip }: ChipProps) {
  const chartData = useMemo(
    () => Array.isArray(data) ? data.map((val, idx) => ({ idx, val })) : [],
    [data]
  );

  const maxValue = useMemo(() => Math.max(...data, 1), [data]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-card hover:bg-accent/50 transition-colors cursor-help">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-sm font-semibold">{value}</div>
            </div>
            <div className="w-16 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <YAxis domain={[0, maxValue]} hide />
                  <Line
                    type="monotone"
                    dataKey="val"
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TooltipTrigger>
        {tooltip && (
          <TooltipContent>
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export function StatsChips({ statsHistory, className }: StatsChipsProps) {
  const latestStats = statsHistory[statsHistory.length - 1];

  const cpuData = useMemo(
    () => Array.isArray(statsHistory) ? statsHistory.map((s) => s.cpuPct) : [],
    [statsHistory]
  );

  const memData = useMemo(
    () => Array.isArray(statsHistory) ? statsHistory.map((s) => s.memPct) : [],
    [statsHistory]
  );

  const netRxData = useMemo(() => {
    const data: number[] = [];
    for (let i = 1; i < statsHistory.length; i++) {
      const delta = statsHistory[i].netRx - statsHistory[i - 1].netRx;
      const timeDelta = (new Date(statsHistory[i].ts).getTime() - new Date(statsHistory[i - 1].ts).getTime()) / 1000;
      data.push(timeDelta > 0 ? delta / timeDelta : 0);
    }
    return data.length ? data : [0];
  }, [statsHistory]);

  const netTxData = useMemo(() => {
    const data: number[] = [];
    for (let i = 1; i < statsHistory.length; i++) {
      const delta = statsHistory[i].netTx - statsHistory[i - 1].netTx;
      const timeDelta = (new Date(statsHistory[i].ts).getTime() - new Date(statsHistory[i - 1].ts).getTime()) / 1000;
      data.push(timeDelta > 0 ? delta / timeDelta : 0);
    }
    return data.length ? data : [0];
  }, [statsHistory]);

  const blkReadData = useMemo(() => {
    const data: number[] = [];
    for (let i = 1; i < statsHistory.length; i++) {
      const delta = statsHistory[i].blkRead - statsHistory[i - 1].blkRead;
      const timeDelta = (new Date(statsHistory[i].ts).getTime() - new Date(statsHistory[i - 1].ts).getTime()) / 1000;
      data.push(timeDelta > 0 ? delta / timeDelta : 0);
    }
    return data.length ? data : [0];
  }, [statsHistory]);

  const blkWriteData = useMemo(() => {
    const data: number[] = [];
    for (let i = 1; i < statsHistory.length; i++) {
      const delta = statsHistory[i].blkWrite - statsHistory[i - 1].blkWrite;
      const timeDelta = (new Date(statsHistory[i].ts).getTime() - new Date(statsHistory[i - 1].ts).getTime()) / 1000;
      data.push(timeDelta > 0 ? delta / timeDelta : 0);
    }
    return data.length ? data : [0];
  }, [statsHistory]);

  if (!latestStats) {
    return (
      <div className={className}>
        <Badge variant="secondary">No stats available</Badge>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-2 ${className || ""}`}>
      <StatChip
        label="CPU"
        value={`${latestStats.cpuPct.toFixed(1)}%`}
        data={cpuData}
        color="hsl(var(--chart-1))"
        tooltip="CPU usage percentage (last 30 samples)"
      />
      <StatChip
        label="Memory"
        value={`${latestStats.memPct.toFixed(1)}%`}
        data={memData}
        color="hsl(var(--chart-2))"
        tooltip={`${formatBytes(latestStats.memBytes)} used`}
      />
      <StatChip
        label="Net RX"
        value={formatRate(netRxData[netRxData.length - 1] || 0)}
        data={netRxData}
        color="hsl(var(--chart-3))"
        tooltip="Network receive rate"
      />
      <StatChip
        label="Net TX"
        value={formatRate(netTxData[netTxData.length - 1] || 0)}
        data={netTxData}
        color="hsl(var(--chart-4))"
        tooltip="Network transmit rate"
      />
      <StatChip
        label="Disk Read"
        value={formatRate(blkReadData[blkReadData.length - 1] || 0)}
        data={blkReadData}
        color="hsl(var(--chart-5))"
        tooltip="Block I/O read rate"
      />
      <StatChip
        label="Disk Write"
        value={formatRate(blkWriteData[blkWriteData.length - 1] || 0)}
        data={blkWriteData}
        color="hsl(var(--chart-1))"
        tooltip="Block I/O write rate"
      />
    </div>
  );
}
