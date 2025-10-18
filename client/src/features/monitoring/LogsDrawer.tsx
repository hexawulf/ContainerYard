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
import { Download, Play, Pause, ExternalLink } from "lucide-react";
import { API_BASE } from "@/lib/api";
import type { ContainerLogsResponse, DozzleLinkResponse } from "@shared/monitoring";

interface LogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  containerId: string;
  containerName: string;
}

export function LogsDrawer({
  open,
  onOpenChange,
  hostId,
  containerId,
  containerName,
}: LogsDrawerProps) {
  const [grep, setGrep] = useState("");
  const [tail, setTail] = useState("500");
  const [since, setSince] = useState("3600");
  const [stdout, setStdout] = useState(true);
  const [stderr, setStderr] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data, isLoading, error, refetch } = useQuery<ContainerLogsResponse | DozzleLinkResponse>({
    queryKey: ["/api/hosts", hostId, "containers", containerId, "logs", { tail, since, grep, stdout, stderr }],
    queryFn: async () => {
      const params = new URLSearchParams({
        tail,
        since,
        stdout: String(stdout),
        stderr: String(stderr),
      });
      if (grep) params.set("grep", grep);

      const res = await fetch(`${API_BASE}/hosts/${hostId}/containers/${containerId}/logs?${params}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch logs: ${res.statusText}`);
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
    }
  }, [open]);

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

    const url = `${API_BASE}/hosts/${hostId}/containers/${containerId}/logs/stream?${params}`;
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
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveLines, isPaused]);

  const handleDownload = () => {
    if (!data || !("content" in data)) return;
    
    const blob = new Blob([data.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

    if ("link" in data) {
      return (
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Logs are not directly accessible for this container. Use Dozzle to view logs.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href={data.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Dozzle
            </a>
          </Button>
        </div>
      );
    }

    const displayContent = isLive ? liveLines.join("\n") : data.content;

    return (
      <ScrollArea className="h-[600px] w-full" ref={scrollRef}>
        <pre className="text-xs font-mono p-4 whitespace-pre-wrap break-words">
          {displayContent || "(empty)"}
        </pre>
      </ScrollArea>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Container Logs</SheetTitle>
          <SheetDescription>{containerName}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
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
              <Select value={since} onValueChange={setSince} disabled={isLive}>
                <SelectTrigger id="since">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3600">Last hour</SelectItem>
                  <SelectItem value="21600">Last 6 hours</SelectItem>
                  <SelectItem value="86400">Last 24 hours</SelectItem>
                  <SelectItem value="0">All time</SelectItem>
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
              {!isLive && (
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  Refresh
                </Button>
              )}
              {data && "content" in data && (
                <Button size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              )}
            </div>
          </div>

          {data && "truncated" in data && data.truncated && (
            <Badge variant="destructive">Truncated at 5000 lines</Badge>
          )}

          <div className="border rounded-lg overflow-hidden bg-muted/20">
            {renderContent()}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
