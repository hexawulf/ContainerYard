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

  const statsQuery = useQuery<ContainerStats>({
    queryKey: statsQueryKey ?? [],
    queryFn: statsQueryKey ? getQueryFn<ContainerStats>({ on401: "throw" }) : undefined,
    enabled: Boolean(statsQueryKey),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const stats = statsQuery.data;
    if (!stats || !selectedHostId || !selectedContainerId) return;

    const key = createHistoryKey(selectedHostId, selectedContainerId);
    setStatsHistory((prev) => {
      const history = [...(prev[key] ?? []), stats];
      return { ...prev, [key]: history.slice(-HISTORY_POINTS) };
    });
  }, [statsQuery.data, selectedHostId, selectedContainerId]);

  const host = hosts.find((item) => item.id === selectedHostId) ?? null;
  const statsKey = selectedHostId && selectedContainerId ? createHistoryKey(selectedHostId, selectedContainerId) : null;
  const history = statsKey ? statsHistory[statsKey] ?? [] : [];

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
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
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
    </div>
  );
}
