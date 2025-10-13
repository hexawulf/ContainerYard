import type { IProvider } from './types';
import type { ContainerSummary, ContainerDetail, LogLine, StatsDataPoint, EnvVar, ContainerAction } from '@shared/schema';

export class SimulationProvider implements IProvider {
  private containers: Map<string, ContainerDetail> = new Map();
  private logIntervals: Map<string, NodeJS.Timeout> = new Map();
  private statsIntervals: Map<string, NodeJS.Timeout> = new Map();
  private execSessions: Map<string, any> = new Map();
  private logSequence: number = 0;
  private logHistory: Map<string, LogLine[]> = new Map();

  constructor() {
    this.initializeContainers();
  }

  private initializeContainers() {
    const now = Date.now();
    const containers: ContainerDetail[] = [
      {
        id: 'web-app-sim',
        name: 'web-application',
        image: 'myapp:latest',
        state: 'running',
        health: 'healthy',
        startedAt: new Date(now - 3600000 * 6).toISOString(),
        cpuPct: 15,
        memPct: 35,
        netRx: 5120000,
        netTx: 3840000,
        ports: [{ container: 8080, host: 8080, protocol: 'tcp' }],
        envCount: 15,
        created: new Date(now - 3600000 * 48).toISOString(),
        command: 'npm start',
        mounts: [{ source: '/app/data', destination: '/data', mode: 'rw' }],
        networks: ['app-network'],
        labels: { service: 'frontend', environment: 'production' },
      },
      {
        id: 'worker-sim',
        name: 'background-worker',
        image: 'worker:v2',
        state: 'running',
        health: 'healthy',
        startedAt: new Date(now - 3600000 * 4).toISOString(),
        cpuPct: 45,
        memPct: 60,
        netRx: 1024000,
        netTx: 2048000,
        ports: [],
        envCount: 8,
        created: new Date(now - 3600000 * 24).toISOString(),
        command: 'python worker.py',
        mounts: [],
        networks: ['app-network'],
        labels: { service: 'worker', queue: 'jobs' },
      },
    ];

    containers.forEach(c => this.containers.set(c.id, c));
  }

  async listContainers(): Promise<ContainerSummary[]> {
    return Array.from(this.containers.values()).map(({ created, command, mounts, networks, labels, ...summary }) => summary);
  }

  async getContainer(id: string): Promise<ContainerDetail | undefined> {
    return this.containers.get(id);
  }

  async performAction(id: string, action: ContainerAction): Promise<void> {
    const container = this.containers.get(id);
    if (!container) throw new Error('Container not found');

    await new Promise(resolve => setTimeout(resolve, 800));

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
        }, 1500);
        break;
      case 'remove':
        this.containers.delete(id);
        break;
    }
  }

  async getEnvVars(id: string): Promise<EnvVar[]> {
    const envs: Record<string, EnvVar[]> = {
      'web-app-sim': [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '8080' },
        { key: 'DATABASE_URL', value: 'postgresql://user:****@db:5432/app' },
        { key: 'REDIS_URL', value: 'redis://cache:6379' },
        { key: 'API_KEY', value: '••••••••' },
        { key: 'LOG_LEVEL', value: 'debug' },
        { key: 'MAX_WORKERS', value: '4' },
        { key: 'RATE_LIMIT', value: '100' },
      ],
      'worker-sim': [
        { key: 'WORKER_CONCURRENCY', value: '10' },
        { key: 'QUEUE_URL', value: 'amqp://rabbitmq:5672' },
        { key: 'RETRY_ATTEMPTS', value: '3' },
        { key: 'TIMEOUT', value: '30000' },
      ],
    };
    return envs[id] || [];
  }

  async getLogs(id: string, options?: { from?: string; to?: string; query?: string }): Promise<LogLine[]> {
    if (!this.containers.has(id)) return [];

    // Initialize log history if not exists
    if (!this.logHistory.has(id)) {
      const history: LogLine[] = [];
      const now = Date.now();
      const scenarios = [
        { weight: 0.6, level: 'info', messages: ['Request processed', 'Task completed', 'Cache hit', 'Query executed'] },
        { weight: 0.2, level: 'warn', messages: ['Slow query detected', 'Rate limit approaching', 'Connection retry'] },
        { weight: 0.15, level: 'debug', messages: ['Trace: method entry', 'Variable value:', 'Step completed'] },
        { weight: 0.05, level: 'error', messages: ['Connection timeout', 'Validation failed', 'Exception caught'] },
      ];
      
      // Generate 150 historical logs
      for (let i = 0; i < 150; i++) {
        const rand = Math.random();
        let cumulative = 0;
        let scenario = scenarios[0];
        for (const s of scenarios) {
          cumulative += s.weight;
          if (rand < cumulative) {
            scenario = s;
            break;
          }
        }
        const message = scenario.messages[Math.floor(Math.random() * scenario.messages.length)];
        
        history.push({
          ts: new Date(now - (150 - i) * 5000).toISOString(),
          raw: `${message} [seq:${this.logSequence++}]`,
          level: scenario.level as any,
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
    const scenarios = [
      { weight: 0.6, level: 'info', messages: ['Request processed', 'Task completed', 'Cache hit', 'Query executed'] },
      { weight: 0.2, level: 'warn', messages: ['Slow query detected', 'Rate limit approaching', 'Connection retry'] },
      { weight: 0.15, level: 'debug', messages: ['Trace: method entry', 'Variable value:', 'Step completed'] },
      { weight: 0.05, level: 'error', messages: ['Connection timeout', 'Validation failed', 'Exception caught'] },
    ];

    const getRandomLog = () => {
      const rand = Math.random();
      let cumulative = 0;
      for (const scenario of scenarios) {
        cumulative += scenario.weight;
        if (rand < cumulative) {
          const message = scenario.messages[Math.floor(Math.random() * scenario.messages.length)];
          
          // 50% chance of JSON structured log
          const isJson = Math.random() < 0.5;
          let raw = '';
          
          if (isJson) {
            const traceId = `trace-${Math.random().toString(36).substr(2, 9)}`;
            const reqId = `req-${Math.random().toString(36).substr(2, 9)}`;
            const service = id === 'web-app-sim' ? 'web-api' : 'worker-service';
            const userId = `user-${Math.floor(Math.random() * 1000)}`;
            const duration = Math.floor(Math.random() * 500) + 10;
            
            const jsonLog: any = {
              message,
              service,
              traceId,
              requestId: reqId,
            };
            
            if (Math.random() < 0.7) {
              jsonLog.userId = userId;
            }
            
            if (scenario.level === 'info' && Math.random() < 0.6) {
              jsonLog.duration = duration;
              jsonLog.method = ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)];
              jsonLog.path = ['/api/users', '/api/orders', '/api/products'][Math.floor(Math.random() * 3)];
              jsonLog.status = [200, 201, 204][Math.floor(Math.random() * 3)];
            }
            
            if (scenario.level === 'error') {
              jsonLog.errorCode = ['ERR_TIMEOUT', 'ERR_VALIDATION', 'ERR_DB'][Math.floor(Math.random() * 3)];
            }
            
            raw = `${new Date().toISOString()} ${scenario.level.toUpperCase()} ${JSON.stringify(jsonLog)}`;
          } else {
            raw = `${message} [seq:${this.logSequence++}]`;
          }
          
          return {
            ts: new Date().toISOString(),
            raw,
            level: scenario.level as any,
          };
        }
      }
      return scenarios[0];
    };

    const interval = setInterval(() => {
      const log = getRandomLog();
      
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
      
      if (Math.random() < 0.1) {
        setTimeout(() => {
          const extraLog = getRandomLog();
          history.push(extraLog);
          callback(extraLog);
        }, 100);
      }
    }, 500 + Math.random() * 1500);

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
    const container = this.containers.get(id);
    if (!container) return () => {};

    let baseCpu = container.cpuPct || 10;
    let baseMem = container.memPct || 20;
    let phase = 0;

    const interval = setInterval(() => {
      phase += 0.1;
      
      const cpuWave = Math.sin(phase) * 15;
      const memWave = Math.cos(phase * 0.5) * 10;
      
      const spike = Math.random() < 0.05 ? 30 : 0;

      callback({
        ts: new Date().toISOString(),
        cpuPct: Math.max(0, Math.min(100, baseCpu + cpuWave + spike)),
        memPct: Math.max(0, Math.min(100, baseMem + memWave)),
        netRx: container.netRx || 0 + Math.random() * 50000,
        netTx: container.netTx || 0 + Math.random() * 30000,
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

  async createExecSession(id: string, cmd?: string[], outputCallback?: (data: string) => void): Promise<string> {
    const sessionId = `sim-exec-${id}-${Date.now()}`;
    this.execSessions.set(sessionId, {
      containerId: id,
      cmd: cmd || ['/bin/sh'],
      active: true,
      outputCallback,
      buffer: '',
    });
    return sessionId;
  }

  writeToExec(sessionId: string, data: string): void {
    const session: any = this.execSessions.get(sessionId);
    if (!session || !session.active) return;

    console.log(`[SIM ${sessionId}] Input:`, data);

    // Accumulate input in buffer
    if (!session.buffer) session.buffer = '';
    session.buffer += data;

    // Check if command is complete (ends with \r or \n)
    if (data === '\r' || data === '\n') {
      const command = session.buffer.trim();
      session.buffer = '';

      if (command && session.outputCallback) {
        // Simulate command execution with slight delay for realism
        setTimeout(() => {
          const output = this.simulateCommandExecution(command, session.containerId);
          if (session.outputCallback) {
            // Send command output followed by new prompt
            session.outputCallback(output + '$ ');
          }
        }, 80);
      } else if (session.outputCallback) {
        // Empty command - just send new prompt
        session.outputCallback('\r\n$ ');
      }
    }
  }

  private simulateCommandExecution(command: string, containerId: string): string {
    const baseResponses: Record<string, string> = {
      'ls': '\r\nDockerfile\r\nnode_modules\r\npackage.json\r\nsrc\r\ndist\r\n.env\r\n',
      'ls -la': '\r\ntotal 92\r\ndrwxr-xr-x 8 node node 4096 Oct 12 14:51 .\r\ndrwxr-xr-x 3 root root 4096 Oct 12 14:50 ..\r\n-rw-r--r-- 1 node node  512 Oct 12 14:50 Dockerfile\r\ndrwxr-xr-x 400 node node 16384 Oct 12 14:51 node_modules\r\n-rw-r--r-- 1 node node 1024 Oct 12 14:50 package.json\r\ndrwxr-xr-x 3 node node 4096 Oct 12 14:50 src\r\n',
      'pwd': '\r\n/app\r\n',
      'whoami': '\r\nnode\r\n',
      'ps aux': '\r\nUSER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\r\nnode         1  0.5  2.1 982440 87264 ?        Ssl  14:50   0:12 node server.js\r\nnode        42  0.0  0.1  11648  3248 pts/0    Rs+  15:02   0:00 ps aux\r\n',
      'df -h': '\r\nFilesystem      Size  Used Avail Use% Mounted on\r\noverlay          59G   24G   35G  41% /\r\ntmpfs            64M     0   64M   0% /dev\r\n',
      'free -h': '\r\n              total        used        free      shared  buff/cache   available\r\nMem:           3.8Gi       1.2Gi       1.8Gi        16Mi       820Mi       2.3Gi\r\nSwap:          2.0Gi          0B       2.0Gi\r\n',
      'uptime': '\r\n 15:02:14 up 1 day, 12:34,  0 users,  load average: 0.45, 0.38, 0.41\r\n',
      'env': '\r\nNODE_ENV=production\r\nPORT=8080\r\nPATH=/usr/local/bin:/usr/bin:/bin\r\nHOME=/home/node\r\n',
    };

    if (command.startsWith('echo ')) {
      const text = command.substring(5);
      return `\r\n${text}\r\n`;
    }

    if (command.startsWith('cat ')) {
      const file = command.substring(4).trim();
      return `\r\n# Contents of ${file}\r\n# This is simulated file content\r\n`;
    }

    if (command.startsWith('tail ')) {
      return '\r\n[LOG] Application started\r\n[LOG] Server listening on port 8080\r\n[LOG] Request received\r\n';
    }

    if (command === 'help' || command === '--help') {
      return '\r\nAvailable commands: ls, pwd, whoami, ps, df, free, uptime, env, echo, cat, tail\r\n';
    }

    return baseResponses[command] || `\r\nsh: ${command}: command not found\r\n`;
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
