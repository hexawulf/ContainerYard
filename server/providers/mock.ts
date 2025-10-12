import type { IProvider } from './types';
import type { ContainerSummary, ContainerDetail, LogLine, StatsDataPoint, EnvVar, ContainerAction } from '@shared/schema';

// Mock data
const mockContainers: ContainerDetail[] = [
  {
    id: 'nginx-proxy-1',
    name: 'nginx-proxy',
    image: 'nginx:alpine',
    state: 'running',
    health: 'healthy',
    startedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    cpuPct: 5.2,
    memPct: 12.5,
    netRx: 1024000,
    netTx: 2048000,
    ports: [
      { container: 80, host: 8080, protocol: 'tcp' },
      { container: 443, host: 8443, protocol: 'tcp' },
    ],
    envCount: 8,
    created: new Date(Date.now() - 7200000 * 24).toISOString(),
    command: 'nginx -g "daemon off;"',
    mounts: [
      { source: '/var/www/html', destination: '/usr/share/nginx/html', mode: 'ro' },
    ],
    networks: ['bridge', 'frontend'],
    labels: {
      'com.example.service': 'web',
      'com.example.version': '1.0.0',
    },
  },
  {
    id: 'redis-cache-1',
    name: 'redis-cache',
    image: 'redis:7-alpine',
    state: 'running',
    health: 'healthy',
    startedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    cpuPct: 2.1,
    memPct: 8.3,
    netRx: 512000,
    netTx: 256000,
    ports: [
      { container: 6379, host: 6379, protocol: 'tcp' },
    ],
    envCount: 4,
    created: new Date(Date.now() - 3600000 * 48).toISOString(),
    command: 'redis-server --appendonly yes',
    mounts: [
      { source: '/data/redis', destination: '/data', mode: 'rw' },
    ],
    networks: ['backend'],
    labels: {
      'com.example.service': 'cache',
    },
  },
  {
    id: 'postgres-db-1',
    name: 'postgres-db',
    image: 'postgres:15-alpine',
    state: 'running',
    health: 'healthy',
    startedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    cpuPct: 8.7,
    memPct: 25.4,
    netRx: 2048000,
    netTx: 1024000,
    ports: [
      { container: 5432, host: 5432, protocol: 'tcp' },
    ],
    envCount: 6,
    created: new Date(Date.now() - 3600000 * 72).toISOString(),
    command: 'postgres',
    mounts: [
      { source: '/var/lib/postgresql/data', destination: '/var/lib/postgresql/data', mode: 'rw' },
    ],
    networks: ['backend'],
    labels: {
      'com.example.service': 'database',
      'com.example.backup': 'enabled',
    },
  },
  {
    id: 'node-api-1',
    name: 'node-api',
    image: 'node:18-alpine',
    state: 'exited',
    health: 'none',
    startedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    cpuPct: 0,
    memPct: 0,
    netRx: 0,
    netTx: 0,
    ports: [
      { container: 3000, host: 3000, protocol: 'tcp' },
    ],
    envCount: 12,
    created: new Date(Date.now() - 3600000 * 24).toISOString(),
    command: 'node server.js',
    mounts: [
      { source: '/app', destination: '/usr/src/app', mode: 'rw' },
    ],
    networks: ['frontend', 'backend'],
    labels: {
      'com.example.service': 'api',
      'com.example.version': '2.1.0',
    },
  },
];

const mockEnvVars: Record<string, EnvVar[]> = {
  'nginx-proxy-1': [
    { key: 'NGINX_HOST', value: 'example.com' },
    { key: 'NGINX_PORT', value: '80' },
    { key: 'TZ', value: 'UTC' },
    { key: 'WORKER_PROCESSES', value: 'auto' },
    { key: 'WORKER_CONNECTIONS', value: '1024' },
  ],
  'redis-cache-1': [
    { key: 'REDIS_PASSWORD', value: '••••••••' },
    { key: 'REDIS_MAXMEMORY', value: '256mb' },
    { key: 'REDIS_MAXMEMORY_POLICY', value: 'allkeys-lru' },
  ],
  'postgres-db-1': [
    { key: 'POSTGRES_DB', value: 'appdb' },
    { key: 'POSTGRES_USER', value: 'admin' },
    { key: 'POSTGRES_PASSWORD', value: '••••••••' },
    { key: 'PGDATA', value: '/var/lib/postgresql/data' },
  ],
  'node-api-1': [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'PORT', value: '3000' },
    { key: 'DATABASE_URL', value: 'postgresql://admin:****@postgres-db:5432/appdb' },
    { key: 'REDIS_URL', value: 'redis://redis-cache:6379' },
    { key: 'API_KEY', value: '••••••••' },
    { key: 'LOG_LEVEL', value: 'info' },
  ],
};

const logLevels = ['info', 'warn', 'error', 'debug'] as const;
const logMessages = [
  'Server started successfully',
  'Incoming request: GET /api/users',
  'Database query executed in 45ms',
  'Cache miss for key: user:123',
  'Authentication successful for user admin',
  'Connection established from 192.168.1.100',
  'Processing background job',
  'Health check passed',
  'Configuration loaded',
  'Middleware initialized',
];

export class MockProvider implements IProvider {
  private logIntervals: Map<string, NodeJS.Timeout> = new Map();
  private statsIntervals: Map<string, NodeJS.Timeout> = new Map();
  private execSessions: Map<string, any> = new Map();
  private logHistory: Map<string, LogLine[]> = new Map();

  async listContainers(): Promise<ContainerSummary[]> {
    return mockContainers.map(({ created, command, mounts, networks, labels, ...summary }) => summary);
  }

  async getContainer(id: string): Promise<ContainerDetail | undefined> {
    return mockContainers.find(c => c.id === id);
  }

  async performAction(id: string, action: ContainerAction): Promise<void> {
    const container = mockContainers.find(c => c.id === id);
    if (!container) {
      throw new Error('Container not found');
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    switch (action) {
      case 'start':
        container.state = 'running';
        container.startedAt = new Date().toISOString();
        break;
      case 'stop':
        container.state = 'exited';
        break;
      case 'restart':
        container.state = 'restarting';
        setTimeout(() => {
          container.state = 'running';
          container.startedAt = new Date().toISOString();
        }, 1000);
        break;
      case 'remove':
        const index = mockContainers.findIndex(c => c.id === id);
        if (index > -1) {
          mockContainers.splice(index, 1);
        }
        break;
    }
  }

  async getEnvVars(id: string): Promise<EnvVar[]> {
    return mockEnvVars[id] || [];
  }

  async getLogs(id: string, options?: { from?: string; to?: string; query?: string }): Promise<LogLine[]> {
    const container = mockContainers.find(c => c.id === id);
    if (!container) return [];

    // Initialize log history if not exists
    if (!this.logHistory.has(id)) {
      const history: LogLine[] = [];
      const now = Date.now();
      
      // Generate 100 historical logs
      for (let i = 0; i < 100; i++) {
        const level = logLevels[Math.floor(Math.random() * logLevels.length)];
        const message = logMessages[Math.floor(Math.random() * logMessages.length)];
        
        history.push({
          ts: new Date(now - (100 - i) * 10000).toISOString(),
          raw: message,
          level,
        });
      }
      
      this.logHistory.set(id, history);
    }

    let logs = this.logHistory.get(id) || [];

    // Filter by time range
    if (options?.from) {
      const fromDate = new Date(options.from);
      logs = logs.filter(log => new Date(log.ts) >= fromDate);
    }
    if (options?.to) {
      const toDate = new Date(options.to);
      logs = logs.filter(log => new Date(log.ts) <= toDate);
    }

    // Filter by query
    if (options?.query) {
      const query = options.query.toLowerCase();
      logs = logs.filter(log => log.raw.toLowerCase().includes(query));
    }

    return logs;
  }

  streamLogs(id: string, callback: (log: LogLine) => void): () => void {
    const interval = setInterval(() => {
      const level = logLevels[Math.floor(Math.random() * logLevels.length)];
      const message = logMessages[Math.floor(Math.random() * logMessages.length)];
      
      const log: LogLine = {
        ts: new Date().toISOString(),
        raw: message,
        level,
      };

      // Add to history
      if (!this.logHistory.has(id)) {
        this.logHistory.set(id, []);
      }
      const history = this.logHistory.get(id)!;
      history.push(log);
      // Keep only last 500 logs in history
      if (history.length > 500) {
        history.shift();
      }
      
      callback(log);
    }, 1000 + Math.random() * 2000);

    this.logIntervals.set(id, interval);

    return () => {
      const interval = this.logIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.logIntervals.delete(id);
      }
    };
  }

  streamStats(id: string, callback: (stats: StatsDataPoint) => void): () => void {
    const container = mockContainers.find(c => c.id === id);
    
    const interval = setInterval(() => {
      if (!container) return;

      const cpuVariance = (Math.random() - 0.5) * 5;
      const memVariance = (Math.random() - 0.5) * 3;

      callback({
        ts: new Date().toISOString(),
        cpuPct: Math.max(0, Math.min(100, (container.cpuPct || 0) + cpuVariance)),
        memPct: Math.max(0, Math.min(100, (container.memPct || 0) + memVariance)),
        netRx: (container.netRx || 0) + Math.random() * 10000,
        netTx: (container.netTx || 0) + Math.random() * 10000,
      });
    }, 1000);

    this.statsIntervals.set(id, interval);

    return () => {
      const interval = this.statsIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.statsIntervals.delete(id);
      }
    };
  }

  async createExecSession(id: string, cmd?: string[]): Promise<string> {
    const sessionId = `exec-${id}-${Date.now()}`;
    this.execSessions.set(sessionId, {
      containerId: id,
      cmd: cmd || ['/bin/sh'],
      active: true,
    });
    return sessionId;
  }

  writeToExec(sessionId: string, data: string): void {
    const session = this.execSessions.get(sessionId);
    if (session && session.active) {
      console.log(`[${sessionId}] Received input:`, data);
    }
  }

  resizeExec(sessionId: string, cols: number, rows: number): void {
    const session = this.execSessions.get(sessionId);
    if (session) {
      session.cols = cols;
      session.rows = rows;
    }
  }

  closeExec(sessionId: string): void {
    const session = this.execSessions.get(sessionId);
    if (session) {
      session.active = false;
      this.execSessions.delete(sessionId);
    }
  }
}
