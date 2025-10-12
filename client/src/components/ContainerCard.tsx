import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCw, Trash2, ExternalLink, Activity, HardDrive, Network } from 'lucide-react';
import type { ContainerSummary } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';

interface ContainerCardProps {
  container: ContainerSummary;
  isSelected?: boolean;
  onClick?: () => void;
  onAction?: (action: 'start' | 'stop' | 'restart' | 'remove') => void;
}

export function ContainerCard({ container, isSelected, onClick, onAction }: ContainerCardProps) {
  const stateColors = {
    running: 'bg-[hsl(142,76%,45%)]',
    exited: 'bg-muted-foreground',
    restarting: 'bg-[hsl(38,92%,50%)]',
    paused: 'bg-[hsl(199,89%,48%)]',
  };

  const healthColors = {
    healthy: 'text-[hsl(142,76%,45%)]',
    unhealthy: 'text-[hsl(0,84%,60%)]',
    starting: 'text-[hsl(38,92%,50%)]',
    none: 'text-muted-foreground',
  };

  const formatUptime = (startedAt?: string) => {
    if (!startedAt) return 'Not started';
    try {
      return formatDistanceToNow(new Date(startedAt), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const handlePortClick = (port: number) => {
    window.open(`http://localhost:${port}`, '_blank');
  };

  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover-elevate active-elevate-2 ${
        isSelected ? 'border-primary' : ''
      }`}
      onClick={onClick}
      data-testid={`card-container-${container.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${stateColors[container.state]}`} />
            <h3 className="font-mono text-sm font-semibold truncate" data-testid={`text-container-name-${container.id}`}>
              {container.name}
            </h3>
          </div>
          
          <p className="text-xs text-muted-foreground truncate mb-2" title={container.image}>
            {container.image}
          </p>

          <div className="flex flex-wrap gap-2 mb-2">
            {container.ports.length > 0 && (
              <div className="flex gap-1">
                {container.ports.slice(0, 3).map((port, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2 hover-elevate"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePortClick(port.host);
                    }}
                    data-testid={`button-port-${container.id}-${port.host}`}
                  >
                    {port.container}:{port.host}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                ))}
                {container.ports.length > 3 && (
                  <Badge variant="secondary" className="h-6 text-xs">
                    +{container.ports.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground capitalize">{container.state}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{formatUptime(container.startedAt)}</span>
            {container.health && container.health !== 'none' && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className={`flex items-center gap-1 ${healthColors[container.health]}`}>
                  <Activity className="h-3 w-3" />
                  {container.health}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Resource Pills */}
          <div className="flex gap-2">
            {container.cpuPct !== undefined && (
              <Badge variant="secondary" className="text-xs h-6 px-2">
                <Activity className="h-3 w-3 mr-1" />
                {container.cpuPct.toFixed(0)}%
              </Badge>
            )}
            {container.memPct !== undefined && (
              <Badge variant="secondary" className="text-xs h-6 px-2">
                <HardDrive className="h-3 w-3 mr-1" />
                {container.memPct.toFixed(0)}%
              </Badge>
            )}
            {(container.netRx !== undefined || container.netTx !== undefined) && (
              <Badge variant="secondary" className="text-xs h-6 px-2">
                <Network className="h-3 w-3 mr-1" />
                {((container.netRx || 0) / 1024).toFixed(0)}K
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-1">
            {container.state === 'exited' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.('start');
                }}
                data-testid={`button-action-start-${container.id}`}
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
            {container.state === 'running' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.('restart');
                  }}
                  data-testid={`button-action-restart-${container.id}`}
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.('stop');
                  }}
                  data-testid={`button-action-stop-${container.id}`}
                >
                  <Square className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.('remove');
              }}
              data-testid={`button-action-remove-${container.id}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
