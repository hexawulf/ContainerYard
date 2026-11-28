import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  ExternalLink,
  ArrowLeft,
  AlertCircle,
  Box,
  Terminal,
  ScrollText,
  Search,
} from "lucide-react";
import { LogsViewer } from "@/components/LogsViewer";
import { Link, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_BASE } from "@/lib/api";
import { hostLogReasonMessage } from "@/lib/hostLogErrors";
import { HostSwitcher } from "@/features/monitoring/HostSwitcher";
import type { HostSummary } from "@shared/monitoring";
import { ensureArray } from "@/lib/utils";
import { hostDisplayName, hostLogsPath, storeHostId } from "@/lib/hostSelection";

type HostLogKind = "file" | "journal" | "docker" | "pm2";

interface HostLog {
  name: string;
  title?: string;
  kind?: HostLogKind;
  path?: string;
  exists: boolean;
  hint?: string;
  size?: number;
  mtime?: string;
}

interface HostLogsListResponse {
  logs: HostLog[];
  available?: boolean;
  reason?: string;
  message?: string;
}

const LOG_FALLBACK_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  nginx_access: {
    title: "Nginx Access Log",
    description: "HTTP access log requests",
  },
  nginx_error: {
    title: "Nginx Error Log",
    description: "Nginx errors and warnings",
  },
  pm2_out: {
    title: "PM2 Output",
    description: "Application stdout logs",
  },
  pm2_err: {
    title: "PM2 Errors",
    description: "Application stderr logs",
  },
  cy_app: {
    title: "ContainerYard App",
    description: "ContainerYard container stdout/stderr",
  },
};

const KIND_GROUPS: Array<{ kind: HostLogKind; label: string }> = [
  { kind: "file", label: "Files" },
  { kind: "journal", label: "journald" },
  { kind: "docker", label: "Docker" },
  { kind: "pm2", label: "PM2" },
];

function KindIcon({ kind }: { kind: HostLogKind }) {
  switch (kind) {
    case "journal":
      return <ScrollText className="h-5 w-5 text-muted-foreground shrink-0" />;
    case "docker":
      return <Box className="h-5 w-5 text-muted-foreground shrink-0" />;
    case "pm2":
      return <Terminal className="h-5 w-5 text-muted-foreground shrink-0" />;
    default:
      return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}

function resolveLogTitle(log: HostLog): string {
  if (log.title && log.title.trim()) return log.title;
  return LOG_FALLBACK_DESCRIPTIONS[log.name]?.title ?? log.name;
}

function resolveLogDescription(log: HostLog): string {
  if (!log.exists && log.hint) return log.hint;
  if (LOG_FALLBACK_DESCRIPTIONS[log.name]?.description) {
    return LOG_FALLBACK_DESCRIPTIONS[log.name].description;
  }
  switch (log.kind) {
    case "journal":
      return "systemd journal unit";
    case "docker":
      return "Docker container logs";
    case "pm2":
      return "PM2 managed process log";
    default:
      return log.path ?? "Host log file";
  }
}

export default function HostLogs({ hostId }: { hostId: string }) {
  const [, navigate] = useLocation();
  const [selectedLog, setSelectedLog] = useState<HostLog | null>(null);
  const [filterText, setFilterText] = useState("");

  const { data: hostsData, isLoading: hostsLoading } = useQuery<HostSummary[]>({
    queryKey: ["/api/hosts"],
  });
  const hosts = useMemo(() => ensureArray<HostSummary>(hostsData), [hostsData]);

  const { data, isLoading, error } = useQuery<HostLogsListResponse>({
    queryKey: ["/api/hosts", hostId, "logs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/hosts/${encodeURIComponent(hostId)}/logs`, {
        credentials: "include",
      });

      if (res.status === 403) {
        throw new Error("Host logs are only available to administrators.");
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch host logs: ${res.statusText}`);
      }

      return res.json();
    },
  });

  // Close the open viewer whenever the host changes (click, Back/Forward, deep link).
  // A source name from host A must never be requested against host B.
  useEffect(() => {
    setSelectedLog(null);
  }, [hostId]);

  // Keep the Dashboard's selected host in step with the URL, but only for a
  // host that actually exists in the list.
  useEffect(() => {
    if (hosts.some((host) => host.id === hostId)) {
      storeHostId(hostId);
    }
  }, [hostId, hosts]);

  const hostName = hostDisplayName(hosts, hostId);

  const handleHostChange = (id: string) => {
    if (id === hostId) return;
    setSelectedLog(null);
    storeHostId(id);
    navigate(hostLogsPath(id));
  };

  const logs = useMemo(() => data?.logs ?? [], [data]);
  const providerError = data?.available === false || Boolean(data?.reason);

  const filteredLogs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        log.name.toLowerCase().includes(q) ||
        resolveLogTitle(log).toLowerCase().includes(q),
    );
  }, [logs, filterText]);

  const groupedLogs = useMemo(() => {
    const byKind = new Map<HostLogKind, HostLog[]>();
    for (const log of filteredLogs) {
      const k: HostLogKind = log.kind ?? "file";
      const list = byKind.get(k) ?? [];
      list.push(log);
      byKind.set(k, list);
    }
    return KIND_GROUPS.map((g) => ({
      ...g,
      items: byKind.get(g.kind) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [filteredLogs]);

  const hasLogs = !isLoading && !error && logs.length > 0;

  function renderBody() {
    if (isLoading) {
      return (
        <div className="text-muted-foreground text-sm">Loading available logs...</div>
      );
    }

    if (error) {
      return (
        <div className="text-destructive text-sm">
          Error loading logs: {(error as Error).message}
        </div>
      );
    }

    if (providerError) {
      return (
        <Card className="border-destructive/50" data-testid="hostlogs-error">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                {hostLogReasonMessage(data?.reason, data?.message)}
              </p>
              {data?.reason && (
                <p className="text-xs text-muted-foreground font-mono">{data.reason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (logs.length === 0) {
      return (
        <Card data-testid="hostlogs-empty">
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            {data?.message ?? "No log source is configured for this host."}
          </CardContent>
        </Card>
      );
    }

    if (groupedLogs.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            No log sources match "{filterText}".
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {groupedLogs.map((group) => (
          <section key={group.kind} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{group.label}</h2>
              <Badge variant="secondary">{group.items.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((log) => {
                const title = resolveLogTitle(log);
                const description = resolveLogDescription(log);
                const kind: HostLogKind = log.kind ?? "file";

                return (
                  <Card
                    key={log.name}
                    className={!log.exists ? "opacity-60" : ""}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <KindIcon kind={kind} />
                          <CardTitle className="text-base truncate" title={title}>
                            {title}
                          </CardTitle>
                        </div>
                        {log.exists ? (
                          <Badge variant="default" className="shrink-0">
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            Unavailable
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p
                          className="text-xs text-muted-foreground font-mono truncate"
                          title={log.path ?? log.name}
                        >
                          {log.path ?? log.name}
                        </p>
                        <Button
                          size="sm"
                          variant={log.exists ? "default" : "outline"}
                          onClick={() => setSelectedLog(log)}
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
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <title>Host Logs - ContainerYard</title>
      <div className="mx-auto max-w-container px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Host Logs</h1>
            <p className="text-muted-foreground text-sm mt-1">
              View system and application logs from {hostName}
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="self-start sm:self-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <HostSwitcher
            hosts={hosts}
            selectedHostId={hostId}
            onChange={handleHostChange}
            isLoading={hostsLoading}
            id="hostlogs-host"
            className="w-full space-y-2 sm:w-64"
          />
          {hasLogs && (
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter log sources by name..."
                className="pl-9"
                aria-label="Filter log sources"
              />
            </div>
          )}
        </div>

        {renderBody()}
      </div>

      {/* Log Viewer Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-6xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedLog ? resolveLogTitle(selectedLog) : ""}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="flex-1 min-h-0">
              <LogsViewer
                key={`${hostId}/${selectedLog.name}`}
                endpoint={`${API_BASE}/hosts/${encodeURIComponent(hostId)}/logs/${selectedLog.name}`}
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
