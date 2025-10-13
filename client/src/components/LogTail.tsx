import { useRef, useEffect, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Play, Pause, Download } from 'lucide-react';
import type { LogLine } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';
import { parseLogLine, buildFieldFilter, type ParsedLog } from '@/lib/logParser';
import { parseQuery, matchesQuery } from '@/lib/queryParser';
import { QuerySyntaxHelper } from './QuerySyntaxHelper';
import { QuerySyntaxReference } from './QuerySyntaxReference';
import { SyntaxHighlightedInput } from './SyntaxHighlightedInput';

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

  // Parse all logs once
  const parsedLogs = useMemo(() => {
    return logs.map(log => parseLogLine(log.raw));
  }, [logs]);

  // Parse query once
  const parsedQuery = useMemo(() => parseQuery(searchQuery), [searchQuery]);

  // Filter logs based on advanced query
  const filteredIndices = useMemo(() => {
    if (!searchQuery.trim()) {
      return logs.map((_, index) => index);
    }

    const indices: number[] = [];
    
    logs.forEach((log, index) => {
      const parsed = parsedLogs[index];
      
      if (matchesQuery(log.raw, log.level, parsed.fields, parsedQuery)) {
        indices.push(index);
      }
    });

    return indices;
  }, [logs, parsedLogs, searchQuery, parsedQuery]);

  const rowVirtualizer = useVirtualizer({
    count: filteredIndices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // Increased to accommodate fields
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
    if (shouldAutoScroll && isLive && filteredIndices.length > 0) {
      rowVirtualizer.scrollToIndex(filteredIndices.length - 1, { align: 'end' });
    }
  }, [filteredIndices.length, shouldAutoScroll, isLive, rowVirtualizer]);

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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <SyntaxHighlightedInput
            placeholder="Search: text, /regex/, field:value, level:warn..error, -exclude..."
            value={searchQuery}
            onChange={(value) => onSearchChange?.(value)}
            className="pl-9 pr-9"
            data-testid="input-log-search"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 z-10"
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

        <QuerySyntaxReference />
      </div>

      {/* Query Syntax Helper */}
      <QuerySyntaxHelper query={searchQuery} />

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
            const actualIndex = filteredIndices[virtualRow.index];
            const log = logs[actualIndex];
            const parsed = parsedLogs[actualIndex];
            
            return (
              <div
                key={actualIndex}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  minHeight: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-start gap-3 px-3 py-1 hover:bg-accent/30 border-b border-border/50"
                data-testid={`log-line-${actualIndex}`}
              >
                <span className="text-muted-foreground shrink-0 w-24">
                  {formatTimestamp(log.ts)}
                </span>
                {log.level && (
                  <Badge variant="outline" className={`shrink-0 h-5 text-xs ${getLevelClass(log.level)}`}>
                    {log.level.substring(0, 3).toUpperCase()}
                  </Badge>
                )}
                <div className={`flex-1 ${getLevelClass(log.level)}`}>
                  <div className="break-all pointer-events-none">
                    {log.raw}
                  </div>
                  {parsed.fields.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parsed.fields.map((field) => (
                        <Badge
                          key={field.key}
                          variant="secondary"
                          className="cursor-pointer hover-elevate text-xs h-5 no-default-active-elevate pointer-events-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            const filter = buildFieldFilter(field.key, field.value);
                            onSearchChange?.(filter);
                          }}
                          data-testid={`field-chip-${field.key}`}
                        >
                          <span className="text-muted-foreground">{field.key}:</span>
                          <span className="ml-1">{field.value}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-scroll Indicator */}
      {!shouldAutoScroll && isLive && filteredIndices.length > 0 && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setShouldAutoScroll(true);
              rowVirtualizer.scrollToIndex(filteredIndices.length - 1, { align: 'end' });
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
