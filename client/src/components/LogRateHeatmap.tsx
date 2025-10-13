import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { LogLine } from '@shared/schema';

interface LogRateHeatmapProps {
  logs: LogLine[];
  bucketSizeSeconds?: number;
  onBurstClick?: (timestamp: string) => void;
}

interface Bucket {
  timestamp: string;
  count: number;
  isBurst: boolean;
  zScore: number;
}

export function LogRateHeatmap({ 
  logs, 
  bucketSizeSeconds = 10,
  onBurstClick
}: LogRateHeatmapProps) {
  
  const buckets = useMemo(() => {
    if (logs.length === 0) return [];

    // Sort logs by timestamp
    const sortedLogs = [...logs].sort((a, b) => 
      new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );

    // Find time range
    const startTime = new Date(sortedLogs[0].ts).getTime();
    const endTime = new Date(sortedLogs[sortedLogs.length - 1].ts).getTime();
    const bucketMs = bucketSizeSeconds * 1000;

    // Create buckets
    const bucketMap = new Map<number, number>();
    const numBuckets = Math.ceil((endTime - startTime) / bucketMs);

    // Initialize all buckets to 0
    for (let i = 0; i < numBuckets; i++) {
      bucketMap.set(startTime + i * bucketMs, 0);
    }

    // Count logs in each bucket
    sortedLogs.forEach(log => {
      const logTime = new Date(log.ts).getTime();
      const bucketKey = Math.floor((logTime - startTime) / bucketMs) * bucketMs + startTime;
      bucketMap.set(bucketKey, (bucketMap.get(bucketKey) || 0) + 1);
    });

    // Calculate mean and standard deviation for burst detection
    const counts = Array.from(bucketMap.values());
    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    // Create bucket objects with Z-score
    const result: Bucket[] = [];
    bucketMap.forEach((count, timestamp) => {
      const zScore = stdDev > 0 ? (count - mean) / stdDev : 0;
      result.push({
        timestamp: new Date(timestamp).toISOString(),
        count,
        isBurst: zScore > 2, // Z-score > 2 indicates burst
        zScore,
      });
    });

    return result;
  }, [logs, bucketSizeSeconds]);

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  if (buckets.length === 0) {
    return (
      <div className="h-20 border-b bg-card/30 flex items-center justify-center text-muted-foreground text-xs">
        No log data for heatmap
      </div>
    );
  }

  const getColor = (count: number, isBurst: boolean) => {
    if (count === 0) return 'hsl(var(--muted))';
    
    if (isBurst) {
      // Burst: red intensity
      const intensity = Math.min(count / maxCount, 1);
      return `hsl(0, ${70 + intensity * 30}%, ${60 - intensity * 40}%)`;
    } else {
      // Normal: blue intensity
      const intensity = Math.min(count / maxCount, 1);
      return `hsl(217, ${50 + intensity * 40}%, ${70 - intensity * 30}%)`;
    }
  };

  return (
    <div className="border-b bg-card/30 p-2" data-testid="log-rate-heatmap">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-3 w-3 text-primary" />
        <span className="text-xs font-medium">Log Rate Heatmap</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {bucketSizeSeconds}s buckets • {buckets.filter(b => b.isBurst).length} bursts detected
        </span>
      </div>

      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {buckets.map((bucket, idx) => {
          const timeLabel = new Date(bucket.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });

          return (
            <div
              key={idx}
              className={`flex-shrink-0 w-3 h-12 rounded-sm ${onBurstClick ? 'cursor-pointer hover-elevate active-elevate-2' : ''} transition-all group relative`}
              style={{ backgroundColor: getColor(bucket.count, bucket.isBurst) }}
              onClick={() => bucket.isBurst && onBurstClick?.(bucket.timestamp)}
              title={`${timeLabel}\n${bucket.count} logs${bucket.isBurst ? ` (BURST: z=${bucket.zScore.toFixed(1)})` : ''}`}
              data-testid={`heatmap-cell-${idx}`}
            >
              {bucket.isBurst && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full border border-background" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'hsl(217, 90%, 40%)' }} />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'hsl(0, 100%, 40%)' }} />
            <span>Burst</span>
          </div>
        </div>
        <span>{buckets.length} time windows</span>
      </div>
    </div>
  );
}
