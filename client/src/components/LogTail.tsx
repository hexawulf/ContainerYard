import { useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Play, Pause, Download } from 'lucide-react';
import type { LogLine } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';

interface LogTailProps {
  logs: LogLine[];
  isLive?: boolean;
  onTogglePause?: () => void;
  onDownload?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function LogTail({
  logs,
  isLive = true,
  onTogglePause,
  onDownload,
  searchQuery = '',
  onSearchChange,
}: LogTailProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  const getLevelClass = (level?: string) => {
    if (!level) return '';
    return `log-${level}`;
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3 
      });
    } catch {
      return ts;
    }
  };

  useEffect(() => {
    if (shouldAutoScroll && isLive && logs.length > 0) {
      rowVirtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
    }
  }, [logs.length, shouldAutoScroll, isLive, rowVirtualizer]);

  const handleScroll = () => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
    setShouldAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b bg-card flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs (text, regex, or level:error)..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-9 pr-9"
            data-testid="input-log-search"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
              onClick={() => onSearchChange?.('')}
              data-testid="button-clear-search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        <Button
          variant={isLive ? 'default' : 'secondary'}
          size="sm"
          onClick={onTogglePause}
          data-testid="button-pause-resume"
          className="gap-2"
        >
          {isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {isLive ? 'Live' : 'Paused'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          data-testid="button-download-logs"
        >
          <Download className="h-3 w-3 mr-2" />
          Download
        </Button>
      </div>

      {/* Log Lines */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-background font-mono text-xs"
        data-testid="container-log-lines"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const log = logs[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-start gap-3 px-3 py-1 hover:bg-accent/30 border-b border-border/50"
                data-testid={`log-line-${virtualRow.index}`}
              >
                <span className="text-muted-foreground shrink-0 w-24">
                  {formatTimestamp(log.ts)}
                </span>
                {log.level && (
                  <Badge variant="outline" className={`shrink-0 h-5 text-xs ${getLevelClass(log.level)}`}>
                    {log.level.substring(0, 3).toUpperCase()}
                  </Badge>
                )}
                <span className={`flex-1 break-all ${getLevelClass(log.level)}`}>
                  {log.raw}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-scroll Indicator */}
      {!shouldAutoScroll && isLive && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setShouldAutoScroll(true);
              rowVirtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
            }}
            data-testid="button-scroll-to-bottom"
            className="shadow-lg"
          >
            Scroll to bottom
          </Button>
        </div>
      )}
    </div>
  );
}
