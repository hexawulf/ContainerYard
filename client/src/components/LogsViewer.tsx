import { useRef, useEffect, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Search, X, Play, Pause, Download, Copy,
  Settings, ChevronDown, ExternalLink
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LogsViewerProps {
  endpoint: string;          // full API URL path (without query params)
  title?: string;
  initialFollow?: boolean;
  initialTail?: number;
  initialStdout?: boolean;
  initialStderr?: boolean;
  initialTimestamps?: boolean;
  initialGrep?: string;
  allowDownload?: boolean;
  dozzleUrl?: string;        // If provided, show "Open in Dozzle" button
}

export function LogsViewer({
  endpoint,
  title = "Logs",
  initialFollow = false,
  initialTail = 500,
  initialStdout = true,
  initialStderr = true,
  initialTimestamps = false,
  initialGrep = '',
  allowDownload = false,
  dozzleUrl,
}: LogsViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [lines, setLines] = useState<string[]>([]);
  const [follow, setFollow] = useState(initialFollow);
  const [tail, setTail] = useState(initialTail);
  const [stdout, setStdout] = useState(initialStdout);
  const [stderr, setStderr] = useState(initialStderr);
  const [timestamps, setTimestamps] = useState(initialTimestamps);
  const [grep, setGrep] = useState(initialGrep);
  const [clientFilter, setClientFilter] = useState('');
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Build query params
  const buildQueryString = (includeFollow = false) => {
    const params = new URLSearchParams();
    if (includeFollow) params.set('follow', '1');
    params.set('tail', String(tail));
    if (!stdout) params.set('stdout', '0');
    if (!stderr) params.set('stderr', '0');
    if (timestamps) params.set('timestamps', '1');
    if (grep) params.set('grep', grep);
    return params.toString();
  };

  // Apply client-side filter
  const filteredLines = useMemo(() => {
    if (!clientFilter.trim()) return lines;
    const filter = clientFilter.toLowerCase();
    return lines.filter(line => line.toLowerCase().includes(filter));
  }, [lines, clientFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 20,
  });

  // Fetch logs (snapshot mode)
  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = `${endpoint}?${buildQueryString(false)}`;
      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.content || '';
      setLines(content.split('\n').filter((line: string) => line.length > 0));
    } catch (err: any) {
      setError(err.message);
      setLines([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Start SSE streaming
  const startStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const streamEndpoint = endpoint.includes('/stream')
      ? endpoint
      : `${endpoint}${endpoint.includes('?') ? '&' : '?'}follow=1`;

    const url = `${streamEndpoint}${streamEndpoint.includes('?') ? '&' : '?'}${buildQueryString(true)}`;

    setIsLoading(true);
    setError(null);
    setLines([]);

    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener('line', (e) => {
      setLines(prev => [...prev, e.data]);
      setIsLoading(false);
    });

    es.addEventListener('error', (e: any) => {
      const errorData = e.data ? JSON.parse(e.data) : {};
      setError(errorData.message || 'Stream error');
    });

    es.onerror = () => {
      setError('Connection lost');
      setIsLoading(false);
      es.close();
    };

    eventSourceRef.current = es;
  };

  // Stop streaming
  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  // Load logs when settings change
  useEffect(() => {
    if (follow) {
      startStreaming();
    } else {
      stopStreaming();
      fetchLogs();
    }

    return () => stopStreaming();
  }, [endpoint, follow, tail, stdout, stderr, timestamps, grep]);

  // Auto-scroll
  useEffect(() => {
    if (shouldAutoScroll && follow && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: 'end' });
    }
  }, [filteredLines.length, shouldAutoScroll, follow, rowVirtualizer]);

  const handleScroll = () => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
    setShouldAutoScroll(isAtBottom);
  };

  const handleToggleFollow = () => {
    setFollow(!follow);
    setShouldAutoScroll(true);
  };

  const handleCopy = () => {
    const text = filteredLines.join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    // TODO: Implement download via /api/logs/download endpoint
    const text = filteredLines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (dozzleUrl) {
    return (
      <Card className="p-6 text-center">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Logs for this container are available via Dozzle
        </p>
        <Button asChild>
          <a href={dozzleUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Dozzle
          </a>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls Bar */}
      <div className="p-3 border-b bg-card flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm mr-auto">{title}</h3>

        <Button
          variant={follow ? 'default' : 'secondary'}
          size="sm"
          onClick={handleToggleFollow}
          className="gap-2"
        >
          {follow ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {follow ? 'Live' : 'Paused'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={filteredLines.length === 0}
        >
          <Copy className="h-3 w-3 mr-2" />
          Copy
        </Button>

        {allowDownload && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={filteredLines.length === 0}
          >
            <Download className="h-3 w-3 mr-2" />
            Download
          </Button>
        )}

        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-3 w-3 mr-2" />
              Settings
              <ChevronDown className="h-3 w-3 ml-2" />
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Settings Panel */}
      <Collapsible open={showSettings} onOpenChange={setShowSettings}>
        <CollapsibleContent>
          <div className="p-4 border-b bg-muted/30 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tail">Tail Lines</Label>
              <Input
                id="tail"
                type="number"
                min={1}
                max={5000}
                value={tail}
                onChange={(e) => setTail(parseInt(e.target.value) || 500)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grep">Server Grep Filter</Label>
              <Input
                id="grep"
                placeholder="Search pattern or /regex/i"
                value={grep}
                onChange={(e) => setGrep(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-filter">Client Filter (fast)</Label>
              <Input
                id="client-filter"
                placeholder="Filter displayed lines"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="stdout"
                checked={stdout}
                onCheckedChange={setStdout}
              />
              <Label htmlFor="stdout">Show stdout</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="stderr"
                checked={stderr}
                onCheckedChange={setStderr}
              />
              <Label htmlFor="stderr">Show stderr</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="timestamps"
                checked={timestamps}
                onCheckedChange={setTimestamps}
              />
              <Label htmlFor="timestamps">Show timestamps</Label>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Status Bar */}
      {(isLoading || error) && (
        <div className="px-3 py-2 bg-muted border-b text-xs">
          {isLoading && <span className="text-muted-foreground">Loading...</span>}
          {error && <span className="text-destructive">Error: {error}</span>}
        </div>
      )}

      {/* Log Lines */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-background font-mono text-xs"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = filteredLines[virtualRow.index];
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
                className="px-3 py-1 hover:bg-accent/30 border-b border-border/50 whitespace-pre-wrap break-all"
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-scroll Indicator */}
      {!shouldAutoScroll && follow && filteredLines.length > 0 && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setShouldAutoScroll(true);
              rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: 'end' });
            }}
            className="shadow-lg"
          >
            Scroll to bottom
          </Button>
        </div>
      )}

      {/* Line Count */}
      <div className="px-3 py-2 border-t bg-card text-xs text-muted-foreground">
        {filteredLines.length} {filteredLines.length === 1 ? 'line' : 'lines'}
        {clientFilter && filteredLines.length !== lines.length && (
          <span> (filtered from {lines.length})</span>
        )}
      </div>
    </div>
  );
}
