import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingUp, TrendingDown, X } from 'lucide-react';
import type { LogLine } from '@shared/schema';

interface RestartComparisonProps {
  logs: LogLine[];
  restartTimestamp: string;
  onClose: () => void;
}

interface ErrorPattern {
  message: string;
  count: number;
  level: string;
}

export function RestartComparison({ logs, restartTimestamp, onClose }: RestartComparisonProps) {
  const analysis = useMemo(() => {
    const restartTime = new Date(restartTimestamp).getTime();
    const windowMs = 60 * 1000; // 1 minute window

    // Split logs into before and after restart
    const beforeLogs = logs.filter(log => {
      const logTime = new Date(log.ts).getTime();
      return logTime >= restartTime - windowMs && logTime < restartTime;
    });

    const afterLogs = logs.filter(log => {
      const logTime = new Date(log.ts).getTime();
      return logTime >= restartTime && logTime < restartTime + windowMs;
    });

    // Analyze error patterns
    const getErrorPatterns = (logList: LogLine[]): ErrorPattern[] => {
      const patterns = new Map<string, ErrorPattern>();
      
      logList.forEach(log => {
        if (log.level === 'error' || log.level === 'fatal') {
          // Extract first 80 chars as pattern
          const pattern = log.raw.substring(0, 80);
          const existing = patterns.get(pattern);
          if (existing) {
            existing.count++;
          } else {
            patterns.set(pattern, { message: pattern, count: 1, level: log.level });
          }
        }
      });

      return Array.from(patterns.values()).sort((a, b) => b.count - a.count).slice(0, 5);
    };

    const beforePatterns = getErrorPatterns(beforeLogs);
    const afterPatterns = getErrorPatterns(afterLogs);

    // Calculate rate deltas
    const beforeErrorRate = beforeLogs.filter(l => l.level === 'error' || l.level === 'fatal').length;
    const afterErrorRate = afterLogs.filter(l => l.level === 'error' || l.level === 'fatal').length;
    const beforeLogRate = beforeLogs.length;
    const afterLogRate = afterLogs.length;

    // Find new error patterns (in after but not in before)
    const beforeMessages = new Set(beforePatterns.map(p => p.message));
    const newPatterns = afterPatterns.filter(p => !beforeMessages.has(p.message));

    return {
      beforeLogs: beforeLogs.length,
      afterLogs: afterLogs.length,
      beforeErrors: beforeErrorRate,
      afterErrors: afterErrorRate,
      beforePatterns,
      afterPatterns,
      newPatterns,
      logRateDelta: afterLogRate - beforeLogRate,
      errorRateDelta: afterErrorRate - beforeErrorRate,
    };
  }, [logs, restartTimestamp]);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[80vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-card z-10">
          <div>
            <h3 className="text-lg font-semibold">Restart Comparison</h3>
            <p className="text-sm text-muted-foreground">
              Comparing 1min before/after restart at {new Date(restartTimestamp).toLocaleString()}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-comparison">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Rate Deltas */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Log Rate</span>
                {analysis.logRateDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-[hsl(142,76%,45%)]" />
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{analysis.afterLogs}</span>
                <span className="text-sm text-muted-foreground">
                  {analysis.logRateDelta >= 0 ? '+' : ''}{analysis.logRateDelta} from {analysis.beforeLogs}
                </span>
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Error Rate</span>
                {analysis.errorRateDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-[hsl(142,76%,45%)]" />
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{analysis.afterErrors}</span>
                <span className="text-sm text-muted-foreground">
                  {analysis.errorRateDelta >= 0 ? '+' : ''}{analysis.errorRateDelta} from {analysis.beforeErrors}
                </span>
              </div>
            </Card>
          </div>

          {/* New Error Patterns */}
          {analysis.newPatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h4 className="font-medium">New Error Patterns ({analysis.newPatterns.length})</h4>
              </div>
              <div className="space-y-2">
                {analysis.newPatterns.map((pattern, idx) => (
                  <Card key={idx} className="p-2 bg-destructive/10">
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-xs font-mono flex-1 break-all">{pattern.message}</code>
                      <Badge variant="destructive" className="h-5 flex-shrink-0">×{pattern.count}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Before/After Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Before Restart</h4>
              {analysis.beforePatterns.length > 0 ? (
                <div className="space-y-2">
                  {analysis.beforePatterns.map((pattern, idx) => (
                    <Card key={idx} className="p-2">
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs font-mono flex-1 break-all">{pattern.message}</code>
                        <Badge variant="outline" className="h-5 flex-shrink-0">×{pattern.count}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No errors detected</p>
              )}
            </div>

            <div>
              <h4 className="font-medium mb-2">After Restart</h4>
              {analysis.afterPatterns.length > 0 ? (
                <div className="space-y-2">
                  {analysis.afterPatterns.map((pattern, idx) => (
                    <Card key={idx} className="p-2">
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs font-mono flex-1 break-all">{pattern.message}</code>
                        <Badge variant="outline" className="h-5 flex-shrink-0">×{pattern.count}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No errors detected</p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
