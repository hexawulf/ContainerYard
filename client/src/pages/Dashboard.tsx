import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ContainerCard } from '@/components/ContainerCard';
import { LogTail } from '@/components/LogTail';
import { TimelineStrip } from '@/components/TimelineStrip';
import { LogRateHeatmap } from '@/components/LogRateHeatmap';
import { RestartComparison } from '@/components/RestartComparison';
import { Terminal } from '@/components/Terminal';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcutsHelp';
import { ActionConfirmDialog } from '@/components/ActionConfirmDialog';
import { EnvVarsPanel } from '@/components/EnvVarsPanel';
import { SavedSearches } from '@/components/SavedSearches';
import { LogBookmarks } from '@/components/LogBookmarks';
import { useKeyboardShortcuts, defaultShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Database, HelpCircle, BookmarkPlus, Activity } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { 
  ContainerSummary, 
  LogLine, 
  StatsDataPoint, 
  ContainerAction,
  EnvVar,
  KeyboardShortcut 
} from '@shared/schema';

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal' | 'env'>('logs');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [stats, setStats] = useState<StatsDataPoint[]>([]);
  const [isLogsPaused, setIsLogsPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    isOpen: boolean;
    action: ContainerAction;
    containerId: string;
    containerName: string;
  } | null>(null);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [targetTimestamp, setTargetTimestamp] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<'spike' | 'bookmark' | null>(null);
  const [restartComparison, setRestartComparison] = useState<string | null>(null);
  const [restartTimestamps, setRestartTimestamps] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Handle deep-linking from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const container = params.get('container');
    const timestamp = params.get('timestamp');
    const filters = params.get('filters');

    if (container) {
      setSelectedContainerId(container);
      if (timestamp) {
        setTargetTimestamp(timestamp);
      }
      if (filters) {
        setSearchQuery(filters);
      }
    }
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const terminalWsRef = useRef<WebSocket | null>(null);

  const { data: containers = [], isLoading } = useQuery<ContainerSummary[]>({
    queryKey: ['/api/containers'],
  });

  const { data: envVars = [] } = useQuery<EnvVar[]>({
    queryKey: ['/api/containers', selectedContainerId, 'env'],
    enabled: !!selectedContainerId,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ containerId, action }: { containerId: string; action: ContainerAction }) => {
      return apiRequest('POST', `/api/containers/${containerId}/action`, { action });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/containers'] });
      
      // Track restart timestamp per container for comparison feature
      if (variables.action === 'restart') {
        const restartTime = new Date().toISOString();
        setRestartTimestamps(prev => ({
          ...prev,
          [variables.containerId]: restartTime
        }));
        
        // Auto-show comparison after 2 seconds to allow logs to accumulate
        setTimeout(() => {
          toast({
            title: 'Restart Analysis Available',
            description: 'Click the Activity icon in the header to view before/after comparison',
          });
        }, 2000);
      }
      
      toast({
        title: 'Action completed',
        description: `Container ${variables.action} successfully`,
      });
      setActionDialog(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: error.message || 'Failed to perform action',
      });
    },
  });

  useEffect(() => {
    if (!selectedContainerId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(`${wsUrl}?type=logs&containerId=${selectedContainerId}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected for logs');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log' && !isLogsPaused) {
          setLogs(prev => [...prev, data.log]);
        } else if (data.type === 'stats') {
          setStats(prev => [...prev.slice(-60), data.stats]);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [selectedContainerId, isLogsPaused]);

  useEffect(() => {
    if (!selectedContainerId || activeTab !== 'terminal') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(`${wsUrl}?type=exec&containerId=${selectedContainerId}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected for terminal');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'exec:data' && (window as any).terminalWrite) {
          (window as any).terminalWrite(data.data);
        }
      } catch (error) {
        console.error('Failed to parse terminal message:', error);
      }
    };

    terminalWsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [selectedContainerId, activeTab]);

  const handleDownloadLogs = async () => {
    if (!selectedContainerId) return;
    
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      
      const url = `/api/containers/${selectedContainerId}/logs/download?${params.toString()}`;
      window.open(url, '_blank');
      
      toast({
        title: 'Download started',
        description: 'Your logs are being downloaded',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'Failed to download logs',
      });
    }
  };

  const handleJumpToBookmark = (containerId: string, timestamp: string, filters?: string) => {
    setSelectedContainerId(containerId);
    setTargetTimestamp(timestamp);
    setScopeType('bookmark');
    
    // Clear or set search query based on bookmark filters
    setSearchQuery(filters || '');
    
    setActiveTab('logs');
    
    // Update URL params for shareable deep-link
    const params = new URLSearchParams();
    params.set('container', containerId);
    params.set('timestamp', timestamp);
    if (filters) {
      params.set('filters', filters);
    }
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    // Pause live tailing to view historical moment
    setIsLogsPaused(true);
    
    toast({
      title: 'Jumped to bookmark',
      description: `Viewing logs at ${new Date(timestamp).toLocaleString()}`,
    });
  };

  const handleSpikeClick = (timestamp: string, metric: 'cpu' | 'mem' | 'net') => {
    // Scope logs to T-10s to T+20s window around spike
    setTargetTimestamp(timestamp);
    setScopeType('spike');
    
    // Pre-fill filters based on spike metric context
    const metricFilters: Record<string, string> = {
      cpu: 'level:warn..error',
      mem: 'level:warn..error',
      net: 'level:info..error',
    };
    setSearchQuery(metricFilters[metric] || '');
    
    setActiveTab('logs');
    setIsLogsPaused(true);
    
    toast({
      title: `${metric.toUpperCase()} Spike Detected`,
      description: `Viewing logs around ${new Date(timestamp).toLocaleString()}`,
    });
  };

  const handleBurstClick = (timestamp: string) => {
    // Scope logs to T-10s to T+20s window around burst
    setTargetTimestamp(timestamp);
    setScopeType('spike');
    
    // Default filter for log bursts (all severity levels)
    setSearchQuery('level:debug..error');
    
    setActiveTab('logs');
    setIsLogsPaused(true);
    
    toast({
      title: 'Log Burst Detected',
      description: `Viewing logs around ${new Date(timestamp).toLocaleString()}`,
    });
  };

  // Clear scope when toggling pause (resuming live mode)
  const handleTogglePause = () => {
    const newPausedState = !isLogsPaused;
    setIsLogsPaused(newPausedState);
    
    // Clear scoping when resuming live mode
    if (!newPausedState) {
      setTargetTimestamp(null);
      setScopeType(null);
    }
  };

  const handleAction = (containerId: string, action: ContainerAction) => {
    const container = containers.find(c => c.id === containerId);
    if (!container) return;

    setActionDialog({
      isOpen: true,
      action,
      containerId,
      containerName: container.name,
    });
  };

  const handleShowRestartComparison = () => {
    if (!selectedContainerId) return;
    
    const containerRestartTime = restartTimestamps[selectedContainerId];
    if (!containerRestartTime) {
      toast({
        title: 'No Restart Detected',
        description: 'Perform a container restart to enable comparison analysis',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate log availability for comparison window
    const restartTime = new Date(containerRestartTime).getTime();
    const windowMs = 60 * 1000; // 1 minute
    const logsInWindow = logs.filter(log => {
      const logTime = new Date(log.ts).getTime();
      return Math.abs(logTime - restartTime) <= windowMs;
    });
    
    if (logsInWindow.length < 10) {
      toast({
        title: 'Insufficient Log Data',
        description: 'Not enough logs available around restart time for meaningful comparison',
        variant: 'destructive',
      });
      return;
    }
    
    setRestartComparison(containerRestartTime);
  };

  const selectedContainer = containers.find(c => c.id === selectedContainerId);

  const shortcuts: KeyboardShortcut[] = [
    {
      ...defaultShortcuts[0],
      action: () => {
        const searchInput = document.querySelector('[data-testid="input-log-search"]') as HTMLInputElement;
        searchInput?.focus();
      },
    },
    {
      ...defaultShortcuts[1],
      action: () => {
        setSearchQuery('');
        setActionDialog(null);
        setShowEnvVars(false);
        setShowShortcutsHelp(false);
      },
    },
    {
      ...defaultShortcuts[2],
      action: () => setIsLogsPaused(prev => !prev),
    },
    {
      ...defaultShortcuts[3],
      action: () => {
        toast({
          title: 'Moment bookmarked',
          description: 'Log moment captured at ' + new Date().toLocaleTimeString(),
        });
      },
    },
    {
      ...defaultShortcuts[4],
      action: () => setShowShortcutsHelp(true),
    },
    {
      ...defaultShortcuts[5],
      action: () => {
        const theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('containeryard-theme', theme);
      },
    },
    ...defaultShortcuts.slice(6, 15).map((shortcut, idx) => ({
      ...shortcut,
      action: () => {
        if (containers[idx]) {
          setSelectedContainerId(containers[idx].id);
        }
      },
    })),
  ];

  useKeyboardShortcuts(shortcuts);

  useEffect(() => {
    if (containers.length > 0 && !selectedContainerId) {
      setSelectedContainerId(containers[0].id);
    }
  }, [containers, selectedContainerId]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-semibold" data-testid="text-app-title">ContainerYard</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            {containers.length} {containers.length === 1 ? 'container' : 'containers'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSavedSearches(true)}
            data-testid="button-saved-searches"
            className="h-9 w-9"
          >
            <BookmarkPlus className="h-4 w-4" />
          </Button>
          {selectedContainer && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShowRestartComparison}
              data-testid="button-restart-comparison"
              className="h-9 w-9"
              title="Restart Analysis"
            >
              <Activity className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowShortcutsHelp(true)}
            data-testid="button-show-shortcuts"
            className="h-9 w-9"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <DarkModeToggle />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-card/30 flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Containers
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading containers...
              </div>
            ) : containers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No containers found
              </div>
            ) : (
              containers.map((container) => (
                <ContainerCard
                  key={container.id}
                  container={container}
                  isSelected={selectedContainerId === container.id}
                  onClick={() => setSelectedContainerId(container.id)}
                  onAction={(action) => handleAction(container.id, action)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedContainer ? (
            <>
              <TimelineStrip stats={stats} onSpikeClick={handleSpikeClick} />
              <LogRateHeatmap logs={logs} onBurstClick={handleBurstClick} />
              
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b px-3 bg-card/30">
                  <TabsList className="h-10">
                    <TabsTrigger value="logs" data-testid="tab-logs">Logs</TabsTrigger>
                    <TabsTrigger value="terminal" data-testid="tab-terminal">Terminal</TabsTrigger>
                    <TabsTrigger value="env" data-testid="tab-env" onClick={() => setShowEnvVars(true)}>
                      Environment ({envVars.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
                  <LogTail
                    logs={logs}
                    isLive={!isLogsPaused}
                    onTogglePause={handleTogglePause}
                    onDownload={handleDownloadLogs}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    containerId={selectedContainerId || undefined}
                    onJumpToBookmark={handleJumpToBookmark}
                    targetTimestamp={targetTimestamp}
                    scopeType={scopeType}
                  />
                </TabsContent>

                <TabsContent value="terminal" className="flex-1 m-0 overflow-hidden">
                  <Terminal
                    containerId={selectedContainerId}
                    onData={(data) => {
                      if (terminalWsRef.current?.readyState === WebSocket.OPEN) {
                        terminalWsRef.current.send(JSON.stringify({
                          type: 'exec:data',
                          data,
                        }));
                      }
                    }}
                    onResize={(cols, rows) => {
                      if (terminalWsRef.current?.readyState === WebSocket.OPEN) {
                        terminalWsRef.current.send(JSON.stringify({
                          type: 'exec:resize',
                          cols,
                          rows,
                        }));
                      }
                    }}
                    isConnected={terminalWsRef.current?.readyState === WebSocket.OPEN}
                  />
                </TabsContent>

                <TabsContent value="env" className="flex-1 m-0">
                  {/* Placeholder - actual panel shown in dialog */}
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a container to view logs and terminal
            </div>
          )}
        </main>
      </div>

      {/* Dialogs */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts}
      />

      {actionDialog && (
        <ActionConfirmDialog
          isOpen={actionDialog.isOpen}
          onClose={() => setActionDialog(null)}
          onConfirm={() => actionMutation.mutate({
            containerId: actionDialog.containerId,
            action: actionDialog.action,
          })}
          action={actionDialog.action}
          containerName={actionDialog.containerName}
          isLoading={actionMutation.isPending}
        />
      )}

      {showEnvVars && selectedContainer && (
        <EnvVarsPanel
          isOpen={showEnvVars}
          onClose={() => setShowEnvVars(false)}
          envVars={envVars}
          containerName={selectedContainer.name}
        />
      )}

      <SavedSearches
        isOpen={showSavedSearches}
        onClose={() => setShowSavedSearches(false)}
        onApplySearch={(query) => setSearchQuery(query)}
        currentQuery={searchQuery}
      />

      {/* Restart Comparison Modal */}
      {restartComparison && (
        <RestartComparison
          logs={logs}
          restartTimestamp={restartComparison}
          onClose={() => setRestartComparison(null)}
        />
      )}
    </div>
  );
}
