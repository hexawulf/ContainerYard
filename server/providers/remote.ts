import type { IProvider } from './types';
import type { ContainerSummary, ContainerDetail, LogLine, StatsDataPoint, EnvVar, ContainerAction } from '@shared/schema';

export class RemoteProvider implements IProvider {
  private dockerHost: string;
  private authToken?: string;
  private logStreamCleanups: Map<string, () => void> = new Map();
  private statsStreamCleanups: Map<string, () => void> = new Map();
  private execSessions: Map<string, any> = new Map();

  constructor() {
    this.dockerHost = process.env.DOCKER_HOST || 'http://localhost:2375';
    this.authToken = process.env.DOCKER_AUTH_TOKEN;
    
    console.log(`RemoteProvider initialized with host: ${this.dockerHost}`);
    if (this.authToken) {
      console.log('Authentication token configured');
    }
  }

  private async dockerRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.dockerHost}${path}`;
    const headers: HeadersInit = {
      ...options.headers,
    };

    // Add bearer token authentication if configured
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Docker API error: ${response.status} - ${error}`);
    }

    return response;
  }

  async listContainers(): Promise<ContainerSummary[]> {
    try {
      const response = await this.dockerRequest('/containers/json?all=true');
      const containers = await response.json();

      return containers.map((c: any) => ({
        id: c.Id.substring(0, 12),
        name: c.Names[0]?.replace(/^\//, '') || c.Id.substring(0, 12),
        image: c.Image,
        state: c.State.toLowerCase() as any,
        health: c.Status.includes('healthy') ? 'healthy' : 
                c.Status.includes('unhealthy') ? 'unhealthy' : 'none',
        startedAt: new Date(c.Created * 1000).toISOString(),
        cpuPct: 0, // Would need stats API call
        memPct: 0,
        netRx: 0,
        netTx: 0,
        ports: (c.Ports || []).map((p: any) => ({
          container: p.PrivatePort,
          host: p.PublicPort || p.PrivatePort,
          protocol: (p.Type || 'tcp') as any,
        })),
        envCount: 0, // Would need inspect call
      }));
    } catch (error) {
      console.error('Failed to list containers:', error);
      return [];
    }
  }

  async getContainer(id: string): Promise<ContainerDetail | undefined> {
    try {
      const response = await this.dockerRequest(`/containers/${id}/json`);
      const c = await response.json();

      return {
        id: c.Id.substring(0, 12),
        name: c.Name.replace(/^\//, ''),
        image: c.Config.Image,
        state: c.State.Status.toLowerCase() as any,
        health: c.State.Health?.Status || 'none' as any,
        startedAt: c.State.StartedAt,
        created: c.Created,
        command: c.Config.Cmd?.join(' ') || '',
        cpuPct: 0,
        memPct: 0,
        netRx: 0,
        netTx: 0,
        ports: Object.entries(c.NetworkSettings.Ports || {}).flatMap(([port, bindings]: [string, any]) => 
          (bindings || []).map((b: any) => ({
            container: parseInt(port.split('/')[0]),
            host: parseInt(b.HostPort),
            protocol: port.split('/')[1] as any,
          }))
        ),
        envCount: c.Config.Env?.length || 0,
        mounts: (c.Mounts || []).map((m: any) => ({
          source: m.Source,
          destination: m.Destination,
          mode: m.Mode,
        })),
        networks: Object.keys(c.NetworkSettings.Networks || {}),
        labels: c.Config.Labels || {},
      };
    } catch (error) {
      console.error(`Failed to get container ${id}:`, error);
      return undefined;
    }
  }

  async performAction(id: string, action: ContainerAction): Promise<void> {
    const endpoints: Record<ContainerAction, string> = {
      start: `/containers/${id}/start`,
      stop: `/containers/${id}/stop`,
      restart: `/containers/${id}/restart`,
      remove: `/containers/${id}?force=true`,
    };

    const method = action === 'remove' ? 'DELETE' : 'POST';
    await this.dockerRequest(endpoints[action], { method });
  }

  async getEnvVars(id: string): Promise<EnvVar[]> {
    try {
      const response = await this.dockerRequest(`/containers/${id}/json`);
      const data = await response.json();
      
      return (data.Config.Env || []).map((env: string) => {
        const [key, ...valueParts] = env.split('=');
        return {
          key,
          value: valueParts.join('='),
        };
      });
    } catch (error) {
      console.error(`Failed to get env vars for ${id}:`, error);
      return [];
    }
  }

  async getLogs(id: string, options?: { from?: string; to?: string; query?: string }): Promise<LogLine[]> {
    try {
      const params = new URLSearchParams({
        stdout: 'true',
        stderr: 'true',
        timestamps: 'true',
        tail: '1000',
      });

      const response = await this.dockerRequest(`/containers/${id}/logs?${params}`);
      const text = await response.text();
      
      // Docker logs format: 8-byte header + message
      const logs: LogLine[] = [];
      const lines = text.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        // Skip Docker multiplexing header (first 8 bytes)
        const cleaned = line.length > 8 ? line.substring(8) : line;
        const match = cleaned.match(/^(\S+)\s+(.*)$/);
        
        if (match) {
          const [, timestamp, message] = match;
          logs.push({
            ts: new Date(timestamp).toISOString(),
            raw: message,
            level: this.detectLogLevel(message),
          });
        }
      }

      return logs;
    } catch (error) {
      console.error(`Failed to get logs for ${id}:`, error);
      return [];
    }
  }

  private detectLogLevel(message: string): 'error' | 'warn' | 'info' | 'debug' | undefined {
    const lower = message.toLowerCase();
    if (lower.includes('error') || lower.includes('fatal')) return 'error';
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('info')) return 'info';
    if (lower.includes('debug')) return 'debug';
    return undefined;
  }

  streamLogs(id: string, callback: (log: LogLine) => void): () => void {
    // Docker logs streaming - polls with tail=1 to get latest log only
    let lastLogTimestamp: string | null = null;
    
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          stdout: 'true',
          stderr: 'true',
          timestamps: 'true',
          tail: '10',
          follow: 'false',
        });

        const response = await this.dockerRequest(`/containers/${id}/logs?${params}`);
        const text = await response.text();
        
        const lines = text.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          const cleaned = line.length > 8 ? line.substring(8) : line;
          const match = cleaned.match(/^(\S+)\s+(.*)$/);
          
          if (match) {
            const [, timestamp, message] = match;
            const logTimestamp = new Date(timestamp).toISOString();
            
            // Only send if this is a new log (after last seen timestamp)
            if (!lastLogTimestamp || logTimestamp > lastLogTimestamp) {
              callback({
                ts: logTimestamp,
                raw: message,
                level: this.detectLogLevel(message),
              });
              lastLogTimestamp = logTimestamp;
            }
          }
        }
      } catch (error) {
        console.error(`Log streaming error for ${id}:`, error);
      }
    }, 1000);

    const cleanup = () => {
      clearInterval(interval);
      this.logStreamCleanups.delete(id);
    };

    this.logStreamCleanups.set(id, cleanup);
    return cleanup;
  }

  streamStats(id: string, callback: (stats: StatsDataPoint) => void): () => void {
    // Docker stats streaming using the stats API
    const interval = setInterval(async () => {
      try {
        const response = await this.dockerRequest(`/containers/${id}/stats?stream=false`);
        const stats = await response.json();
        
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPct = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

        const memUsage = stats.memory_stats.usage || 0;
        const memLimit = stats.memory_stats.limit || 1;
        const memPct = (memUsage / memLimit) * 100;

        callback({
          ts: new Date().toISOString(),
          cpuPct: Math.min(cpuPct || 0, 100),
          memPct: Math.min(memPct || 0, 100),
          netRx: stats.networks?.eth0?.rx_bytes || 0,
          netTx: stats.networks?.eth0?.tx_bytes || 0,
        });
      } catch (error) {
        console.error(`Stats streaming error for ${id}:`, error);
      }
    }, 2000);

    const cleanup = () => {
      clearInterval(interval);
      this.statsStreamCleanups.delete(id);
    };

    this.statsStreamCleanups.set(id, cleanup);
    return cleanup;
  }

  async createExecSession(id: string, cmd?: string[], outputCallback?: (data: string) => void): Promise<string> {
    try {
      // Create exec instance
      const createResponse = await this.dockerRequest(`/containers/${id}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: cmd || ['/bin/sh'],
        }),
      });

      const { Id: execId } = await createResponse.json();
      
      // Start exec session (streaming not fully implemented)
      await this.dockerRequest(`/exec/${execId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Detach: false,
          Tty: true,
        }),
      });

      this.execSessions.set(execId, { id, outputCallback });
      return execId;
    } catch (error) {
      console.error(`Failed to create exec session for ${id}:`, error);
      throw error;
    }
  }

  writeToExec(sessionId: string, data: string): void {
    // Docker exec write not implemented - would need bidirectional streaming
    console.log(`Write to exec ${sessionId}:`, data);
  }

  resizeExec(sessionId: string, cols: number, rows: number): void {
    this.dockerRequest(`/exec/${sessionId}/resize?h=${rows}&w=${cols}`, {
      method: 'POST',
    }).catch(error => {
      console.error(`Failed to resize exec ${sessionId}:`, error);
    });
  }

  closeExec(sessionId: string): void {
    this.execSessions.delete(sessionId);
  }
}
