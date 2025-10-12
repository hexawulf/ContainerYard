import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, HardDrive, Network, PlayCircle, StopCircle, AlertCircle } from 'lucide-react';
import type { StatsDataPoint } from '@shared/schema';

interface TimelineStripProps {
  stats: StatsDataPoint[];
  events?: Array<{ ts: string; type: 'start' | 'stop' | 'health' | 'restart'; label: string }>;
}

export function TimelineStrip({ stats, events = [] }: TimelineStripProps) {
  const chartData = useMemo(() => {
    return stats.map(stat => ({
      ts: new Date(stat.ts).getTime(),
      cpu: stat.cpuPct,
      mem: stat.memPct,
      net: ((stat.netRx + stat.netTx) / 1024) || 0,
      label: new Date(stat.ts).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }),
    }));
  }, [stats]);

  const eventMarkers = useMemo(() => {
    return events.map(event => ({
      ...event,
      ts: new Date(event.ts).getTime(),
    }));
  }, [events]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'start':
        return <PlayCircle className="h-3 w-3 text-[hsl(142,76%,45%)]" />;
      case 'stop':
        return <StopCircle className="h-3 w-3 text-muted-foreground" />;
      case 'health':
        return <AlertCircle className="h-3 w-3 text-[hsl(0,84%,60%)]" />;
      case 'restart':
        return <Activity className="h-3 w-3 text-[hsl(38,92%,50%)]" />;
      default:
        return null;
    }
  };

  if (chartData.length === 0) {
    return (
      <div className="h-32 border-b bg-card/50 backdrop-blur-sm flex items-center justify-center text-muted-foreground text-sm">
        No metrics data available
      </div>
    );
  }

  return (
    <div className="h-32 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10" data-testid="timeline-strip">
      <div className="grid grid-cols-3 h-full">
        {/* CPU Chart */}
        <div className="border-r p-2">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-3 w-3 text-[hsl(217,91%,60%)]" />
            <span className="text-xs text-muted-foreground">CPU %</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData}>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="cpu" 
                stroke="hsl(217,91%,60%)" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Memory Chart */}
        <div className="border-r p-2">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="h-3 w-3 text-[hsl(142,76%,45%)]" />
            <span className="text-xs text-muted-foreground">Memory %</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData}>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="mem" 
                stroke="hsl(142,76%,45%)" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Network Chart */}
        <div className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <Network className="h-3 w-3 text-[hsl(199,89%,48%)]" />
            <span className="text-xs text-muted-foreground">Network KB/s</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData}>
              <XAxis dataKey="label" hide />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="net" 
                stroke="hsl(199,89%,48%)" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Event Markers */}
      {eventMarkers.length > 0 && (
        <div className="absolute top-0 left-0 right-0 h-full pointer-events-none">
          {eventMarkers.map((event, idx) => {
            const percentage = chartData.length > 0 
              ? ((event.ts - chartData[0].ts) / (chartData[chartData.length - 1].ts - chartData[0].ts)) * 100
              : 0;
            
            return (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-0.5 bg-border pointer-events-auto group"
                style={{ left: `${percentage}%` }}
                title={event.label}
              >
                <div className="absolute top-1 left-1/2 -translate-x-1/2">
                  {getEventIcon(event.type)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
