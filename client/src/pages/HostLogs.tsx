import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, ArrowLeft } from "lucide-react";
import { LogsViewer } from "@/components/LogsViewer";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_BASE } from "@/lib/api";

interface HostLog {
  name: string;
  path: string;
  exists: boolean;
}

interface HostLogsListResponse {
  logs: HostLog[];
}

const LOG_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  nginx_containerYard_access: {
    title: "Nginx Access Log",
    description: "HTTP requests to container.piapps.dev"
  },
  nginx_containerYard_error: {
    title: "Nginx Error Log",
    description: "Nginx errors and warnings"
  },
  pm2_containeryard_out: {
    title: "PM2 Output",
    description: "ContainerYard application output"
  },
  pm2_containeryard_err: {
    title: "PM2 Errors",
    description: "ContainerYard application errors"
  },
  grafana_server: {
    title: "Grafana Server",
    description: "Grafana service logs"
  },
  prometheus_server: {
    title: "Prometheus Server",
    description: "Prometheus service logs"
  },
  cryptoagent_freqtrade: {
    title: "FreqTrade",
    description: "Crypto trading bot logs"
  },
};

export default function HostLogs() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<HostLogsListResponse>({
    queryKey: ["/api/hostlogs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/hostlogs`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch host logs: ${res.statusText}`);
      }

      return res.json();
    },
  });

  const handleViewLog = (logName: string) => {
    setSelectedLog(logName);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">Loading available logs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-destructive">
          Error loading logs: {(error as Error).message}
        </div>
      </div>
    );
  }

  const logs = data?.logs ?? [];

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Host Logs</h1>
            <p className="text-muted-foreground mt-2">
              View system and application logs from the Pi host
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {logs.map((log) => {
            const info = LOG_DESCRIPTIONS[log.name] || {
              title: log.name,
              description: log.path,
            };

            return (
              <Card
                key={log.name}
                className={!log.exists ? "opacity-50" : ""}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">{info.title}</CardTitle>
                    </div>
                    {log.exists ? (
                      <Badge variant="default">Available</Badge>
                    ) : (
                      <Badge variant="secondary">Not Found</Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    {info.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {log.path}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleViewLog(log.name)}
                      disabled={!log.exists}
                      className="w-full"
                    >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      View Logs
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {logs.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No host logs configured
            </CardContent>
          </Card>
        )}
      </div>

      {/* Log Viewer Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-6xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedLog && (LOG_DESCRIPTIONS[selectedLog]?.title || selectedLog)}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="flex-1 min-h-0">
              <LogsViewer
                endpoint={`${API_BASE}/hostlogs/${selectedLog}`}
                title=""
                initialFollow={false}
                initialTail={500}
                allowDownload={true}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
