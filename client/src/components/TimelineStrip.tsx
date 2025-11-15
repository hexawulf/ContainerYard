import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, HardDrive, Network, PlayCircle, StopCircle, AlertCircle } from 'lucide-react';
import type { StatsDataPoint } from '@shared/schema';

interface TimelineStripProps {
  stats: StatsDataPoint[];
  events?: Array<{ ts: string; type: 'start' | 'stop' | 'health' | 'restart'; label: string }>;
  onSpikeClick?: (timestamp: string, metric: 'cpu' | 'mem' | 'net') => void;
}

export function TimelineStrip({ stats, events = [], onSpikeClick }: TimelineStripProps) {
  const chartData = useMemo(() => {
    return stats.map((stat, idx) => ({
      ts: new Date(stat.ts).getTime(),
      tsISO: stat.ts,
      cpu: stat.cpuPct,
      mem: stat.memPct,
      net: ((stat.netRx + stat.netTx) / 1024) || 0,
      label: new Date(stat.ts).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }),
      idx,
    }));
  }, [stats]);

  // Detect spikes: data points significantly higher than local average
  const spikes = useMemo(() => {
    const detected: Array<{ idx: number; metric: 'cpu' | 'mem' | 'net'; value: number; ts: string }> = [];
    const window = 5; // Look at 5 neighbors on each side
    const threshold = 1.5; // 50% higher than local average

    chartData.forEach((point, idx) => {
      if (idx < window || idx >= chartData.length - window) return;

      // Check CPU spike
      const cpuLocalAvg = chartData
        .slice(idx - window, idx + window + 1)
        .filter((_, i) => i !== window)
        .reduce((sum, p) => sum + p.cpu, 0) / (window * 2);
      if (point.cpu > cpuLocalAvg * threshold && point.cpu > 30) {
        detected.push({ idx, metric: 'cpu', value: point.cpu, ts: point.tsISO });
      }

      // Check Memory spike
      const memLocalAvg = chartData
        .slice(idx - window, idx + window + 1)
        .filter((_, i) => i !== window)
        .reduce((sum, p) => sum + p.mem, 0) / (window * 2);
      if (point.mem > memLocalAvg * threshold && point.mem > 30) {
        detected.push({ idx, metric: 'mem', value: point.mem, ts: point.tsISO });
      }

      // Check Network spike
      const netLocalAvg = chartData
        .slice(idx - window, idx + window + 1)
        .filter((_, i) => i !== window)
        .reduce((sum, p) => sum + p.net, 0) / (window * 2);
      if (point.net > netLocalAvg * threshold && point.net > 10) {
        detected.push({ idx, metric: 'net', value: point.net, ts: point.tsISO });
      }
    });

    return detected;
  }, [chartData]);

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
       {Array.isArray(eventMarkers) && eventMarkers.length > 0 && (
        <div className="absolute top-0 left-0 right-0 h-full pointer-events-none">
          {eventMarkers.map((event, idx) => {
             const percentage = Array.isArray(chartData) && chartData.length > 0 
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

      {/* Spike Indicators */}
       {Array.isArray(spikes) && spikes.length > 0 && onSpikeClick && (
        <div className="absolute top-0 left-0 right-0 h-full pointer-events-none">
          {spikes.map((spike, idx) => {
            const spikeData = chartData[spike.idx];
            if (!spikeData) return null;

             const percentage = Array.isArray(chartData) && chartData.length > 0 
               ? ((spikeData.ts - chartData[0].ts) / (chartData[chartData.length - 1].ts - chartData[0].ts)) * 100
               : 0;
            
            const getColor = (metric: string) => {
              switch (metric) {
                case 'cpu': return 'hsl(217,91%,60%)';
                case 'mem': return 'hsl(142,76%,45%)';
                case 'net': return 'hsl(199,89%,48%)';
                default: return 'hsl(var(--primary))';
              }
            };

            const getYPosition = (metric: string) => {
              switch (metric) {
                case 'cpu': return '15%';
                case 'mem': return '48%';
                case 'net': return '82%';
                default: return '50%';
              }
            };

            return (
              <div
                key={`${spike.metric}-${idx}`}
                className="absolute pointer-events-auto cursor-pointer hover-elevate active-elevate-2 transition-all"
                style={{ 
                  left: `${percentage}%`,
                  top: getYPosition(spike.metric),
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => onSpikeClick(spike.ts, spike.metric)}
                title={`${spike.metric?.toUpperCase() || 'METRIC'} spike: ${spike.value.toFixed(1)}${spike.metric === 'net' ? ' KB/s' : '%'}\nClick to view logs`}
                data-testid={`spike-${spike.metric}-${spike.idx}`}
              >
                <div 
                  className="w-3 h-3 rounded-full border-2 bg-background"
                  style={{ borderColor: getColor(spike.metric) }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
