import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/AuthGate";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import type {
  ContainerDetail,
  ContainerStats,
  ContainerSummary,
  HostSummary,
} from "@shared/monitoring";
import { HostSwitcher } from "@/features/monitoring/HostSwitcher";
import { ContainerTable } from "@/features/monitoring/ContainerTable";
import { StatsPanel } from "@/features/monitoring/StatsPanel";
import { LogsDrawer } from "@/features/monitoring/LogsDrawer";
import { InspectModal } from "@/features/monitoring/InspectModal";
import { StatsChips } from "@/features/monitoring/StatsChips";
import type { NormalizedStats } from "@shared/monitoring";

const HOST_STORAGE_KEY = "cy.selectedHost";
const HISTORY_POINTS = 30;

function createHistoryKey(hostId: string, containerId: string) {
  return `${hostId}:${containerId}`;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [selectedHostId, setSelectedHostId] = useState<string | null>(() => localStorage.getItem(HOST_STORAGE_KEY));
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [statsHistory, setStatsHistory] = useState<Record<string, ContainerStats[]>>({});
  const [normalizedStatsHistory, setNormalizedStatsHistory] = useState<Record<string, NormalizedStats[]>>({});
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [inspectContainerId, setInspectContainerId] = useState<string | null>(null);

  const { data: hostsData, isLoading: hostsLoading } = useQuery<HostSummary[]>({
    queryKey: ["/api/hosts"],
  });

  const hosts = hostsData ?? [];

  useEffect(() => {
    if (!hosts.length) {
      setSelectedHostId(null);
      return;
    }

    if (!selectedHostId || !hosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId(hosts[0].id);
    }
  }, [hosts, selectedHostId]);

  useEffect(() => {
    if (selectedHostId) {
      localStorage.setItem(HOST_STORAGE_KEY, selectedHostId);
    }
  }, [selectedHostId]);

  const containersQueryKey = useMemo(() => {
    if (!selectedHostId) return null;
    return ["/api/hosts", selectedHostId, "containers"] as const;
  }, [selectedHostId]);

  const hostStatsQueryKey = useMemo(() => {
    if (!selectedHostId) return null;
    return ["/api/hosts", selectedHostId, "stats"] as const;
  }, [selectedHostId]);

  const hostStats = useQuery({
    queryKey: hostStatsQueryKey ?? [],
    queryFn: hostStatsQueryKey ? getQueryFn({ on401: "throw" }) : undefined,
    enabled: Boolean(hostStatsQueryKey),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: containersData, isLoading: containersLoading } = useQuery<ContainerSummary[]>({
    queryKey: containersQueryKey ?? [],
    queryFn: containersQueryKey ? getQueryFn<ContainerSummary[]>({ on401: "throw" }) : undefined,
    enabled: Boolean(containersQueryKey),
  });

  const containers = containersData ?? [];

  useEffect(() => {
    if (!containers.length) {
      setSelectedContainerId(null);
      return;
    }

    if (!selectedContainerId || !containers.some((container) => container.id === selectedContainerId)) {
      setSelectedContainerId(containers[0].id);
    }
  }, [containers, selectedContainerId]);

  const detailQueryKey = useMemo(() => {
    if (!selectedHostId || !selectedContainerId) return null;
    return ["/api/hosts", selectedHostId, "containers", selectedContainerId] as const;
  }, [selectedHostId, selectedContainerId]);

  const { data: containerDetail, isLoading: detailLoading } = useQuery<ContainerDetail | null>({
    queryKey: detailQueryKey ?? [],
    queryFn: detailQueryKey ? getQueryFn<ContainerDetail>({ on401: "throw" }) : undefined,
    enabled: Boolean(detailQueryKey),
  });

  const statsQueryKey = useMemo(() => {
    if (!selectedHostId || !selectedContainerId) return null;
    return ["/api/hosts", selectedHostId, "containers", selectedContainerId, "stats"] as const;
  }, [selectedHostId, selectedContainerId]);

  const statsQuery = useQuery<NormalizedStats>({
    queryKey: statsQueryKey ?? [],
    queryFn: statsQueryKey ? getQueryFn<NormalizedStats>({ on401: "throw" }) : undefined,
    enabled: Boolean(statsQueryKey),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // ✅ Define host BEFORE using it in hook dependencies
  const host = hosts.find((item) => item.id === selectedHostId) ?? null;

  useEffect(() => {
    const stats = statsQuery.data;
    if (!stats || !selectedHostId || !selectedContainerId) return;

    const key = createHistoryKey(selectedHostId, selectedContainerId);

    // Store normalized stats for sparklines
    setNormalizedStatsHistory((prev) => {
      const history = [...(prev[key] ?? []), stats];
      return { ...prev, [key]: history.slice(-HISTORY_POINTS) };
    });

    // Convert to ContainerStats for backward compatibility
    const legacyStats: ContainerStats = {
      id: selectedContainerId,
      hostId: selectedHostId,
      provider: host?.provider || "DOCKER",
      cpuPercent: stats.cpuPct,
      memoryUsage: stats.memBytes,
      memoryLimit: stats.memBytes, // TODO: get actual limit
      memoryPercent: stats.memPct,
      networkRx: stats.netRx,
      networkTx: stats.netTx,
      blockRead: stats.blkRead,
      blockWrite: stats.blkWrite,
      timestamp: stats.ts,
    };

    setStatsHistory((prev) => {
      const history = [...(prev[key] ?? []), legacyStats];
      return { ...prev, [key]: history.slice(-HISTORY_POINTS) };
    });
  }, [statsQuery.data, selectedHostId, selectedContainerId, host]);
  const statsKey = selectedHostId && selectedContainerId ? createHistoryKey(selectedHostId, selectedContainerId) : null;
  const history = statsKey ? statsHistory[statsKey] ?? [] : [];
  const normalizedHistory = statsKey ? normalizedStatsHistory[statsKey] ?? [] : [];
  
  const logsContainer = containers.find((c) => c.id === logsContainerId);
  const inspectContainer = containers.find((c) => c.id === inspectContainerId);

  const latestStatsByContainer = useMemo(() => {
    const map: Record<string, ContainerStats | undefined> = {};
    if (!selectedHostId) return map;

    for (const [key, values] of Object.entries(statsHistory)) {
      const [hostId, containerId] = key.split(":");
      if (hostId === selectedHostId && containerId) {
        map[containerId] = values.at(-1);
      }
    }
    return map;
  }, [statsHistory, selectedHostId]);

  const handleHostChange = (hostId: string) => {
    setSelectedContainerId(null);
    setSelectedHostId(hostId);
    queryClient.removeQueries({ queryKey: ["/api/hosts", hostId, "containers"] });
  };

  return (
    <div className="container max-w-container py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display">Dashboard</h1>
        <div className="flex items-center gap-3">
          {user && (
            <Badge variant="outline" className="uppercase tracking-wide">
              {user.role}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <CardTitle>Hosts</CardTitle>
            <HostSwitcher
              hosts={hosts}
              selectedHostId={selectedHostId}
              onChange={handleHostChange}
              isLoading={hostsLoading}
            />
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <ContainerTable
              containers={containers}
              host={host}
              selectedId={selectedContainerId}
              onSelect={setSelectedContainerId}
              statsByContainer={latestStatsByContainer}
              isLoading={containersLoading}
              onLogsClick={setLogsContainerId}
              onInspectClick={setInspectContainerId}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {normalizedHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Real-time Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsChips statsHistory={normalizedHistory} />
              </CardContent>
            </Card>
          )}
          
          {detailLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Container overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Loading container details…</p>
              </CardContent>
            </Card>
          ) : (
            <StatsPanel host={host} detail={containerDetail ?? null} statsHistory={history} />
          )}
        </div>
      </div>

      {logsContainerId && logsContainer && selectedHostId && (
        <LogsDrawer
          open={Boolean(logsContainerId)}
          onOpenChange={(open) => !open && setLogsContainerId(null)}
          hostId={selectedHostId}
          containerId={logsContainerId}
          containerName={logsContainer.name}
        />
      )}

      {inspectContainerId && containerDetail && containerDetail.id === inspectContainerId && (
        <InspectModal
          open={Boolean(inspectContainerId)}
          onOpenChange={(open) => !open && setInspectContainerId(null)}
          container={containerDetail}
        />
      )}
    </div>
  );
}
