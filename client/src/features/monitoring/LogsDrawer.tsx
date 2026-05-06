import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Download, Play, Pause, ExternalLink, Search } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { SavedSearches } from "@/components/SavedSearches";
import { LogBookmarks } from "@/components/LogBookmarks";

type LogsResponse =
  | { mode: "docker"; content: string; truncated: boolean }
  | { mode: "unsupported"; message: string }
  | { mode: "dozzle"; message: string; dozzleUrl: string };

interface LogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  containerId: string;
  containerName: string;
  initialJumpTimestamp?: string | null;
  initialJumpMetric?: "cpu" | "mem" | "net" | null;
}

export function LogsDrawer({
  open,
  onOpenChange,
  hostId,
  containerId,
  containerName,
  initialJumpTimestamp,
  initialJumpMetric,
}: LogsDrawerProps) {
  const [grep, setGrep] = useState("");
  const [tail, setTail] = useState("500");
  const [since, setSince] = useState("3600");
  const [stdout, setStdout] = useState(true);
  const [stderr, setStderr] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState<string>();
  const [highlightActive, setHighlightActive] = useState(false);
  const [jumpTimestamp, setJumpTimestamp] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Handle initial jump
  useEffect(() => {
    if (open && initialJumpTimestamp) {
      setIsLive(false);
      setSince(initialJumpTimestamp);
      setJumpTimestamp(initialJumpTimestamp);
      setHighlightActive(true);
      
      // Auto-clear highlight after 5s
      const timer = setTimeout(() => setHighlightActive(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [open, initialJumpTimestamp]);

  const { data, isLoading, error, refetch } = useQuery<LogsResponse>({
    queryKey: ["/api/hosts", hostId, "containers", containerId, "logs", { tail, since, grep, stdout, stderr }],
    queryFn: async () => {
      // Determine if since is a duration (number) or timestamp (ISO)
      const isDuration = /^\d+$/.test(since);
      const sinceParam = isDuration 
        ? (since === "0" ? "" : `${since}s`)
        : since;

      const params = new URLSearchParams({
        tail,
        since: sinceParam,
        stdout: String(stdout),
        stderr: String(stderr),
        follow: "false",
      });
      if (grep) params.set("grep", grep);

      const res = await fetch(`${API_BASE}/hosts/${hostId}/containers/${containerId}/logs?${params}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "unknown_error", message: res.statusText }));
        throw new Error(errorData.message || `Failed to fetch logs: ${res.statusText}`);
      }

      return res.json();
    },
    enabled: open && !isLive,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!open) {
      setIsLive(false);
      setLiveLines([]);
      setJumpTimestamp(null);
      setHighlightActive(false);
    } else {
      // Set current timestamp when drawer opens
      setCurrentTimestamp(new Date().toISOString());
    }
  }, [open]);

  useEffect(() => {
    if (highlightActive && scrollRef.current && data && data.mode === "docker") {
      // Scroll to top of the log area when jumping to a timestamp
      scrollRef.current.scrollTop = 0;
    }
  }, [highlightActive, data]);

  useEffect(() => {
    if (!isLive) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const params = new URLSearchParams({
      stdout: String(stdout),
      stderr: String(stderr),
    });
    if (grep) params.set("grep", grep);

    const url = `${API_BASE}/hosts/${hostId}/containers/${containerId}/logs?${params}&follow=true`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("line", (event) => {
      if (!isPaused) {
        setLiveLines((prev) => [...prev.slice(-999), event.data]);
      }
    });

    es.addEventListener("error", (event) => {
      console.error("SSE error:", event);
      setIsLive(false);
    });

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, [isLive, hostId, containerId, grep, stdout, stderr, isPaused]);

  useEffect(() => {
    if (!isPaused && scrollRef.current && isLive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveLines, isPaused, isLive]);

  const handleDownload = () => {
    // Use server download endpoint for admin users
    const params = new URLSearchParams({
      scope: 'container',
      hostId,
      id: containerId,
      tail: tail,
      since: since,
    });
    if (grep) params.set('grep', grep);
    
    const downloadUrl = `${API_BASE}/logs/download?${params}`;
    
    // Create a temporary anchor element to trigger download
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${containerName}-logs-${Date.now()}.txt`;
    a.click();
  };

  const handleApplySearch = (query: string) => {
    setGrep(query);
    if (isLive) {
      setIsLive(false);
      setTimeout(() => setIsLive(true), 100);
    } else {
      refetch();
    }
  };

  const handleJumpToBookmark = (containerId: string, timestamp: string, filters?: string) => {
    // For now, just set the timestamp and refresh
    setSince(timestamp);
    setJumpTimestamp(timestamp);
    setHighlightActive(true);
    if (filters) {
      setGrep(filters);
    }
    setTimeout(() => setHighlightActive(false), 5000);
    refetch();
  };

  const renderContent = () => {
    if (error) {
      return (
        <div className="text-sm text-destructive p-4">
          Error loading logs: {(error as Error).message}
        </div>
      );
    }

    if (isLoading) {
      return <div className="text-sm text-muted-foreground p-4">Loading logs...</div>;
    }

    if (!data) {
      return <div className="text-sm text-muted-foreground p-4">No logs available</div>;
    }

    if (data.mode === "dozzle") {
      return (
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.message}
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href={data.dozzleUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Dozzle
            </a>
          </Button>
        </div>
      );
    }

    if (data.mode === "unsupported") {
      return (
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.message}
          </p>
        </div>
      );
    }

    if (data.mode === "docker") {
      const displayContent = isLive ? liveLines : (data.content ? data.content.split("\n") : []);

      return (
        <ScrollArea className="h-[600px] w-full" ref={scrollRef}>
          <div className="text-xs font-mono p-4">
            {displayContent.length > 0 ? (
              displayContent.map((line, idx) => {
                const isFirstLineOfJump = !isLive && idx === 0 && jumpTimestamp;
                return (
                  <div 
                    key={idx} 
                    className={`whitespace-pre-wrap break-words py-0.5 px-1 rounded transition-colors duration-1000 ${
                      isFirstLineOfJump && highlightActive ? 'bg-yellow-500/30 ring-1 ring-yellow-500/50' : ''
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              <span className="text-muted-foreground italic">(empty)</span>
            )}
          </div>
        </ScrollArea>
      );
    }

    return <div className="text-sm text-muted-foreground p-4">Unknown logs format</div>;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Container Logs</SheetTitle>
          <SheetDescription>{containerName}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {jumpTimestamp && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-2 flex items-center justify-between">
              <div className="text-xs flex items-center gap-2">
                <span className="font-medium text-yellow-600 dark:text-yellow-400">Jumped to moment:</span>
                <code className="text-[10px] bg-yellow-500/20 px-1 rounded">
                  {new Date(jumpTimestamp).toLocaleString()}
                </code>
                {initialJumpMetric && (
                  <Badge variant="outline" className="text-[9px] uppercase h-4 px-1">
                    {initialJumpMetric} spike
                  </Badge>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[10px] hover:bg-yellow-500/20"
                onClick={() => {
                  setSince("3600");
                  setJumpTimestamp(null);
                }}
              >
                Reset Filter
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tail">Tail</Label>
              <Select value={tail} onValueChange={setTail} disabled={isLive}>
                <SelectTrigger id="tail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 lines</SelectItem>
                  <SelectItem value="500">500 lines</SelectItem>
                  <SelectItem value="1000">1000 lines</SelectItem>
                  <SelectItem value="5000">5000 lines</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="since">Since</Label>
              <Select 
                value={/^\d+$/.test(since) ? since : "custom"} 
                onValueChange={(val) => {
                  if (val !== "custom") {
                    setSince(val);
                    setJumpTimestamp(null);
                  }
                }} 
                disabled={isLive}
              >
                <SelectTrigger id="since">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3600">Last hour</SelectItem>
                  <SelectItem value="21600">Last 6 hours</SelectItem>
                  <SelectItem value="86400">Last 24 hours</SelectItem>
                  <SelectItem value="0">All time</SelectItem>
                  {!/^\d+$/.test(since) && (
                    <SelectItem value="custom">Custom moment</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grep">Search (grep)</Label>
            <Input
              id="grep"
              placeholder="Filter logs..."
              value={grep}
              onChange={(e) => setGrep(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="stdout" checked={stdout} onCheckedChange={setStdout} />
              <Label htmlFor="stdout" className="cursor-pointer">stdout</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="stderr" checked={stderr} onCheckedChange={setStderr} />
              <Label htmlFor="stderr" className="cursor-pointer">stderr</Label>
            </div>
          </div>

           <div className="flex items-center justify-between gap-2">
             <div className="flex items-center gap-2">
               <Button
                 size="sm"
                 variant={isLive ? "default" : "outline"}
                 onClick={() => {
                   setIsLive(!isLive);
                   setIsPaused(false);
                 }}
               >
                 {isLive ? "Stop Live" : "Go Live"}
               </Button>
               {isLive && (
                 <Button size="sm" variant="outline" onClick={() => setIsPaused(!isPaused)}>
                   {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                 </Button>
               )}
               {isLive && <Badge variant="secondary">{liveLines.length} lines</Badge>}
             </div>
             <div className="flex items-center gap-2">
               <LogBookmarks
                 containerId={containerId}
                 currentTimestamp={currentTimestamp}
                 currentFilters={grep}
                 onJumpTo={handleJumpToBookmark}
               />
               <Button 
                 size="sm" 
                 variant="outline" 
                 onClick={() => setShowSavedSearches(true)}
               >
                 <Search className="h-4 w-4 mr-1" />
                 Saved Searches
               </Button>
               {!isLive && (
                 <Button size="sm" variant="outline" onClick={() => refetch()}>
                   Refresh
                 </Button>
               )}
                 {data && data.mode === "docker" && (
                   <Button size="sm" variant="outline" onClick={handleDownload}>
                     <Download className="h-4 w-4 mr-1" />
                     Download
                   </Button>
                 )}
              </div>
            </div>
 
            {data && data.mode === "docker" && data.truncated && (
              <Badge variant="destructive">Truncated at 5000 lines</Badge>
            )}

           <div className="border rounded-lg overflow-hidden bg-muted/20">
             {renderContent()}
           </div>
         </div>
       </SheetContent>

       <SavedSearches
         isOpen={showSavedSearches}
         onClose={() => setShowSavedSearches(false)}
         onApplySearch={handleApplySearch}
         currentQuery={grep}
       />
     </Sheet>
   );
 }
