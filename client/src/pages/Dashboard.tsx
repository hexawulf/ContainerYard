import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/AuthGate";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import type {
  ContainerDetail,
  ContainerStats,
  ContainerSummary,
  HostSummary,
} from "@shared/monitoring";
import { HostSwitcher } from "@/features/monitoring/HostSwitcher";
import { ContainerTable } from "@/features/monitoring/ContainerTable";
import { StackView } from "@/features/monitoring/StackView";
import { StatsPanel } from "@/features/monitoring/StatsPanel";
import { LogsDrawer } from "@/features/monitoring/LogsDrawer";
import { InspectModal } from "@/features/monitoring/InspectModal";
import { StatsChips } from "@/features/monitoring/StatsChips";
import { HistoricalMetricsChart } from "@/features/monitoring/HistoricalMetricsChart";
import { MetricsWidgets } from "@/features/monitoring/MetricsWidgets";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, List, Layers } from "lucide-react";
import type { NormalizedStats } from "@shared/monitoring";

const HOST_STORAGE_KEY = "cy.selectedHost";
const FILTERS_STORAGE_KEY = "cy.containerFilters";
const SORT_STORAGE_KEY = "cy.containerSort";
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
  const [showHistoricalMetrics, setShowHistoricalMetrics] = useState(false);
  
  // Filter and sort state
  interface FilterState {
    state: string;
    label: string;
    image: string;
  }
  
  interface SortState {
    field: string;
    direction: string;
  }
  
  const [filters, setFilters] = useState<FilterState>(() => {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { state: "all", label: "", image: "" };
  });
  const [sort, setSort] = useState<SortState>(() => {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { field: "name", direction: "asc" };
  });
  
  const [viewMode, setViewMode] = useState<"containers" | "stacks">("containers");

  const { data: hostsData, isLoading: hostsLoading } = useQuery<HostSummary[]>({
    queryKey: ["/api/hosts"],
  });

  const hosts = useMemo(() => hostsData ?? [], [hostsData]);

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

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  }, [sort]);

  const containersQueryKey = useMemo(() => {
    if (!selectedHostId) return null;
    return ["/api/hosts", selectedHostId, "containers"] as const;
  }, [selectedHostId]);

  const hostStatsQueryKey = useMemo(() => {
    if (!selectedHostId) return null;
    return ["/api/hosts", selectedHostId, "stats"] as const;
  }, [selectedHostId]);

  // const hostStats = useQuery({
  // const hostStats = useQuery({
  //   queryKey: hostStatsQueryKey ?? [],
  //   queryFn: hostStatsQueryKey ? getQueryFn({ on401: "throw" }) : undefined,
  //   enabled: Boolean(hostStatsQueryKey),
  //   refetchInterval: 5000,
  //   refetchIntervalInBackground: true,
  // });
  const { data: containersData, isLoading: containersLoading } = useQuery<ContainerSummary[]>({
    queryKey: containersQueryKey ?? [],
    queryFn: containersQueryKey ? getQueryFn<ContainerSummary[]>({ on401: "throw" }) : undefined,
    enabled: Boolean(containersQueryKey),
  });

  const containers = useMemo(() => containersData ?? [], [containersData]);

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
  const host = useMemo(
    () => hosts.find((item) => item.id === selectedHostId) ?? null,
    [hosts, selectedHostId]
  );

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
  // const inspectContainer = containers.find((c) => c.id === inspectContainerId);

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

  // Filter and sort containers
  const filteredAndSortedContainers = useMemo(() => {
    let filtered = containers;

    // Apply state filter
    if (filters.state !== "all") {
      filtered = filtered.filter(container => container.state === filters.state);
    }

    // Apply label filter
    if (filters.label) {
      filtered = filtered.filter(container => 
        Object.entries(container.labels || {}).some(([key, value]) => 
          `${key}=${value}`.toLowerCase().includes(filters.label.toLowerCase())
        )
      );
    }

    // Apply image filter
    if (filters.image) {
      filtered = filtered.filter(container => 
        container.image.toLowerCase().includes(filters.image.toLowerCase())
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const aStats = latestStatsByContainer[a.id];
      const bStats = latestStatsByContainer[b.id];
      
      switch (sort.field) {
        case "name":
          return sort.direction === "asc" 
            ? a.name.localeCompare(b.name) 
            : b.name.localeCompare(a.name);
        case "cpu": {
          const aCpu = aStats?.cpuPercent || 0;
          const bCpu = bStats?.cpuPercent || 0;
          return sort.direction === "desc" ? bCpu - aCpu : aCpu - bCpu;
        }
        case "memory": {
          const aMem = aStats?.memoryPercent || 0;
          const bMem = bStats?.memoryPercent || 0;
          return sort.direction === "desc" ? bMem - aMem : aMem - bMem;
        }
        case "uptime": {
          const aUptime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bUptime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return sort.direction === "desc" ? bUptime - aUptime : aUptime - bUptime;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [containers, filters, sort, latestStatsByContainer]);

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistoricalMetrics(!showHistoricalMetrics)}
          >
            {showHistoricalMetrics ? "Hide" : "Show"} Historical Metrics
          </Button>
          <Link href="/host-logs">
            <Button variant="outline" size="sm">
              Host Logs
            </Button>
          </Link>
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

      {/* Metrics Widgets */}
      {selectedHostId && (
        <div className="mb-6">
          <MetricsWidgets hostId={selectedHostId} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle>Hosts</CardTitle>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "containers" | "stacks")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="containers" className="gap-2">
                    <List className="h-4 w-4" />
                    Containers
                  </TabsTrigger>
                  <TabsTrigger value="stacks" className="gap-2">
                    <Layers className="h-4 w-4" />
                    Stacks
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <HostSwitcher
              hosts={hosts}
              selectedHostId={selectedHostId}
              onChange={handleHostChange}
              isLoading={hostsLoading}
            />
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {viewMode === "containers" && (
            <>
            {/* Filter Controls */}
            <div className="p-4 space-y-3 border-b">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium">Filters:</span>
                
                {/* State Filter */}
                <Select value={filters.state} onValueChange={(value) => setFilters(prev => ({ ...prev, state: value }))}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="exited">Exited</SelectItem>
                  </SelectContent>
                </Select>

                {/* Label Filter */}
                <Input
                  placeholder="Label filter"
                  value={filters.label}
                  onChange={(e) => setFilters(prev => ({ ...prev, label: e.target.value }))}
                  className="w-40"
                />

                {/* Image Filter */}
                <Input
                  placeholder="Image filter"
                  value={filters.image}
                  onChange={(e) => setFilters(prev => ({ ...prev, image: e.target.value }))}
                  className="w-40"
                />

                {/* Clear Filters */}
                {(filters.state !== "all" || filters.label || filters.image) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters({ state: "all", label: "", image: "" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select 
                  value={sort.field} 
                  onValueChange={(field) => setSort(prev => ({ ...prev, field }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="cpu">CPU %</SelectItem>
                    <SelectItem value="memory">Memory %</SelectItem>
                    <SelectItem value="uptime">Uptime</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select 
                  value={sort.direction} 
                  onValueChange={(direction) => setSort(prev => ({ ...prev, direction }))}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ContainerTable
              containers={filteredAndSortedContainers}
              host={host}
              selectedId={selectedContainerId}
              onSelect={setSelectedContainerId}
              statsByContainer={latestStatsByContainer}
              isLoading={containersLoading}
              onLogsClick={setLogsContainerId}
              onInspectClick={setInspectContainerId}
            />
            </>
            )}
            {viewMode === "stacks" && selectedHostId && (
              <div className="p-4">
                <StackView
                  hostId={selectedHostId}
                  host={hosts.find(h => h.id === selectedHostId) || null}
                  onContainerSelect={setSelectedContainerId}
                  onLogsClick={setLogsContainerId}
                  onInspectClick={setInspectContainerId}
                  selectedContainerId={selectedContainerId}
                />
              </div>
            )}
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

      {/* Historical Metrics Section */}
      {showHistoricalMetrics && selectedHostId && selectedContainerId && containerDetail && (
        <div className="mt-6">
          <HistoricalMetricsChart
            hostId={selectedHostId}
            containerId={selectedContainerId}
            containerName={containerDetail.name}
          />
        </div>
      )}

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