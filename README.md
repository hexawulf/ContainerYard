[![Website](https://img.shields.io/badge/website-containeryard.org-blue)](https://containeryard.org)
[![GitHub](https://img.shields.io/github/stars/hexawulf/ContainerYard?style=social)](https://github.com/hexawulf/ContainerYard)

# ContainerYard 🐳

> A complete Docker stack monitoring platform with log analysis, alerting, and historical trends

ContainerYard is a comprehensive Docker observability platform that goes beyond simple log viewing. It provides Docker Compose stack management, proactive alerting, historical metrics analysis, and real-time log streaming—all in one sleek, developer-friendly interface. Built with React 18 and Express, it bridges the gap between lightweight viewers and enterprise monitoring solutions.

![ContainerYard Dashboard](https://github.com/hexawulf/ContainerYard/blob/main/attached_assets/screenshot.png?raw=true)


## ✨ Features

### 🎯 Stack Management (Phase 1)
- **Docker Compose Stack Detection** - Automatically groups containers by compose project
- **Stack Health Indicators** - Visual status badges (healthy/unhealthy/partial/unknown)
- **Bulk Stack Operations** - Start, stop, or restart entire stacks with one click
- **Stack-Level Metrics** - Aggregated stats for all containers in a stack
- **Standalone Container View** - Separate display for non-compose containers

### 📢 Proactive Alerting (Phase 1)
- **Alert Rules Engine** - Define CPU, memory, status, and log pattern alerts
- **Duration-Based Triggers** - Alerts fire only when conditions persist (e.g., CPU > 80% for 5 minutes)
- **Multiple Notification Channels** - Webhook, email, and browser notifications
- **Alert History & Acknowledgment** - Track triggered alerts with audit trail
- **Smart Debouncing** - Prevents notification spam with 5-minute cooldown
- **Background Monitoring** - Continuous 30-second health checks
- **Container Filtering** - Target specific containers by name, image, or labels

### 📊 Historical Trends (Phase 1)
- **Hourly Metrics Aggregation** - Automatic collection and storage of container metrics
- **90-Day Retention** - Long-term trend analysis with configurable retention
- **Top Resource Consumers** - Identify CPU and memory hogs over time
- **Metrics Summary API** - Query historical data with flexible time ranges
- **Avg/Max Statistics** - Track both average and peak resource usage
- **Per-Container History** - Detailed historical charts for capacity planning

### Core Features
- 🔴 **Real-time Container Monitoring** - Live status updates, metrics, and health checks
- 📜 **Advanced Log Streaming** - Virtual scrolling for performance with large log datasets
- 🔍 **Powerful Search & Filtering** - Regex support, log level filtering, and custom DSL queries
- 💻 **Integrated Terminal** - Web-based shell access for container debugging
- ⌨️ **Keyboard Shortcuts** - Navigate efficiently with keyboard-driven controls
- 🌓 **Dark/Light Mode** - Beautiful themes optimized for log readability

### Advanced Features
- 🎨 **Multi-Container Log Interleaving** - Stream and compare logs from up to 3 containers simultaneously
- 🔖 **Log Moments Bookmarks** - Save timestamped log moments with notes and shareable deep-links
- 📊 **JSON Field Detection** - Auto-parse structured logs with interactive field chips
- 🔎 **Query DSL** - Advanced query syntax: `level:warn..error`, `service:auth`, `-"exclude"`
- 📈 **Timeline Spike Analysis** - Clickable metric spikes auto-scope logs to relevant time windows
- 🔥 **Log Rate Heatmap** - Visualize log bursts with Z-score detection and auto-filtering
- 🔄 **Restart Comparison** - Before/after restart analysis with error pattern detection
- 💾 **Saved Searches** - Persist search queries with PostgreSQL for quick reuse
- 🌐 **Environment Viewer** - Search, filter, and bulk export container environment variables

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker daemon (for REMOTE provider) or use built-in MOCK/SIMULATION providers

### Installation

```bash
# Clone the repository
git clone git@github.com:hexawulf/ContainerYard.git
cd ContainerYard

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Set PROVIDER to MOCK for demo mode (no Docker needed)

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Provider Selection
PROVIDER=MOCK  # Options: MOCK, SIMULATION, REMOTE

# Remote Docker (when PROVIDER=REMOTE)
DOCKER_HOST=http://localhost:2375
DOCKER_AUTH_TOKEN=your-token-here
ALLOWED_ORIGINS=http://localhost:3000

# Database (optional - for saved searches)
DATABASE_URL=postgresql://user:password@localhost:5432/containeryard
```

### Provider Modes

**MOCK** (Default)
- Static mock data for development and demos
- No Docker daemon required
- Perfect for testing and UI development

**SIMULATION**
- Dynamic simulation with realistic generated logs
- Simulates CPU/memory metrics and log patterns
- Great for testing without Docker

**REMOTE**
- Connect to real Docker API
- Requires Docker daemon with API enabled
- Supports bearer token authentication
- CORS security with `ALLOWED_ORIGINS` enforcement

### Docker API Setup (REMOTE Mode)

To enable the Docker API on your host:

```bash
# Linux/macOS - edit Docker daemon config
sudo vim /etc/docker/daemon.json
```

Add:
```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"]
}
```

For secure production use, enable TLS authentication and set `DOCKER_AUTH_TOKEN`.

## 🛠️ Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Database migrations (if using PostgreSQL)
npm run db:push

# Type checking
npx tsc --noEmit
```

### Project Structure

```
ContainerYard/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route pages
│   │   ├── lib/         # Utilities
│   │   └── App.tsx      # App entry
├── server/              # Express backend
│   ├── providers/       # Data source providers
│   ├── routes.ts        # API endpoints
│   └── index.ts         # Server entry
├── shared/              # Shared types and schemas
└── package.json
```

## 🏗️ Tech Stack

### Frontend
- **React 18** - Modern UI library with hooks
- **TypeScript** - Type safety and developer experience
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible component library
- **TanStack Query** - Server state management
- **TanStack Virtual** - Virtualized log rendering
- **xterm.js** - Terminal emulator
- **Recharts** - Data visualization
- **Wouter** - Lightweight routing

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **WebSocket (ws)** - Real-time communication
- **Drizzle ORM** - Type-safe database toolkit
- **Zod** - Schema validation

### Database
- **PostgreSQL** - Required for alerts, metrics, saved searches, and bookmarks
- **Neon Serverless** - Serverless PostgreSQL driver
- **Drizzle ORM** - Type-safe database operations with migrations

## 📡 API Reference

ContainerYard provides comprehensive REST APIs for container monitoring, stack management, alerting, and historical metrics.

### Container Logs

**GET** `/api/hosts/:hostId/containers/:containerId/logs`

Query parameters:
- `tail` - Number of lines (default: 500, max: 5000)
- `since` - ISO8601 timestamp or seconds
- `grep` - Search pattern (safely escaped)
- `stdout` - Include stdout (default: true)
- `stderr` - Include stderr (default: true)

Response:
```json
{
  "content": "log content",
  "truncated": false
}
```

For Synology/cAdvisor hosts without direct log access, returns:
```json
{
  "link": "http://dozzle-url/#/container/:id"
}
```

### Live Log Streaming (SSE)

**GET** `/api/hosts/:hostId/containers/:containerId/logs/stream`

Server-Sent Events endpoint for real-time log streaming (Docker only).

Query parameters: `stdout`, `stderr`, `grep`

Events:
- `event: line` - Log line data
- `:heartbeat` - Keep-alive every 15s

### Container Stats

**GET** `/api/hosts/:hostId/containers/:containerId/stats`

Returns normalized metrics:
```json
{
  "cpuPct": 12.5,
  "memPct": 45.2,
  "memBytes": 536870912,
  "blkRead": 1024000,
  "blkWrite": 512000,
  "netRx": 2048000,
  "netTx": 1024000,
  "ts": "2024-01-01T12:00:00.000Z"
}
```

### Docker Compose Stacks

**GET** `/api/hosts/:hostId/stacks`

List all Docker Compose stacks with health indicators.

Response:
```json
{
  "stacks": [
    {
      "name": "myapp",
      "containers": [...],
      "containerCount": 3,
      "runningCount": 3,
      "stoppedCount": 0,
      "healthStatus": "healthy"
    }
  ],
  "standaloneContainers": [...]
}
```

**GET** `/api/hosts/:hostId/stacks/:name`

Get details for a specific stack.

**POST** `/api/hosts/:hostId/stacks/:name/action`

Perform bulk actions (start/stop/restart) on all containers in a stack.

Body: `{ "action": "start" | "stop" | "restart" | "remove" }`

### Alert Management

**Notification Channels**

- `GET /api/alerts/channels` - List all channels
- `POST /api/alerts/channels` - Create channel
- `PATCH /api/alerts/channels/:id` - Update channel
- `DELETE /api/alerts/channels/:id` - Delete channel
- `POST /api/alerts/channels/:id/test` - Test notification

**Alert Rules**

- `GET /api/alerts/rules` - List all rules
- `POST /api/alerts/rules` - Create rule
- `PATCH /api/alerts/rules/:id` - Update rule
- `DELETE /api/alerts/rules/:id` - Delete rule

Alert rule example:
```json
{
  "name": "High CPU Alert",
  "conditionType": "cpu_percent",
  "operator": ">",
  "threshold": "80",
  "durationMinutes": 5,
  "channelId": 1,
  "enabled": "true"
}
```

**Alert History**

- `GET /api/alerts/history?limit=100` - Get alert history
- `POST /api/alerts/history/:id/acknowledge` - Acknowledge alert

### Historical Metrics

**GET** `/api/hosts/:hostId/containers/:containerId/metrics/history?days=7`

Get historical metrics for a container (default: 7 days).

Response includes hourly aggregated data:
```json
[
  {
    "aggregatedAt": "2024-01-01T12:00:00.000Z",
    "avgCpuPercent": "45.2",
    "maxCpuPercent": "78.5",
    "avgMemoryPercent": "62.1",
    "maxMemoryPercent": "85.3",
    "sampleCount": 60
  }
]
```

**GET** `/api/hosts/:hostId/metrics/summary?days=7`

Get aggregated metrics summary for all containers.

**GET** `/api/hosts/:hostId/metrics/top-cpu?limit=5`

Get top CPU-consuming containers.

**GET** `/api/hosts/:hostId/metrics/top-memory?limit=5`

Get top memory-consuming containers.

### Prometheus Metrics

**GET** `/metrics`

Exports process metrics (CPU, memory, HTTP duration) in Prometheus format.

Optional authentication via `x-metrics-token` header (set `METRICS_TOKEN` in .env).

### Background Services

ContainerYard runs two background services for continuous monitoring:

**Alert Worker**
- Checks alert rules every 30 seconds
- Evaluates conditions across all hosts and containers
- Sends notifications via configured channels
- 5-minute debouncing to prevent spam

**Metrics Aggregator**
- Collects metrics every minute
- Aggregates hourly for historical storage
- Stores 90 days of trend data (configurable)
- Automatic cleanup on server shutdown

### Testing

```bash
# Manual cURL test
curl -s -H "cookie: cy.sid=<session>" \
  "https://your-app.dev/api/hosts/piapps/containers/<cid>/logs?tail=100" | jq .

# SSE streaming test
node scripts/test-sse.js https://your-app.dev piapps <cid> "cy.sid=<session>"

# Test stack detection
curl -s -H "cookie: cy.sid=<session>" \
  "https://your-app.dev/api/hosts/piapps/stacks" | jq .

# Run Jest tests (requires test container)
TEST_CONTAINER_ID=<cid> npm test
```

## 📚 Documentation

- [Phase 1 Implementation](PHASE1_IMPLEMENTATION_SUMMARY.md) - Complete feature breakdown
- [Deployment Guide](DEPLOYMENT.md) - Production deployment instructions
- [Environment Variables](.env.example) - Configuration reference
- [Architecture](replit.md) - Technical architecture details
- [Original Plan](plan.md) - Phase 1 relaunch strategy

## 🔑 Keyboard Shortcuts

- `Cmd/Ctrl + K` - Focus search
- `Cmd/Ctrl + L` - Clear logs
- `Cmd/Ctrl + F` - Find in logs
- `Esc` - Close dialogs/clear search

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Dozzle](https://dozzle.dev/) - A simple, lightweight Docker log viewer
- Built with [shadcn/ui](https://ui.shadcn.com/) - Beautifully designed components
- Powered by [Replit](https://replit.com/) - The collaborative browser-based IDE

## 📧 Contact

Erling Wulf - [@hexawulf](https://github.com/hexawulf)

Project Link: [https://github.com/hexawulf/ContainerYard](https://github.com/hexawulf/ContainerYard)

---

Made with ❤️ by [hexawulf](https://github.com/hexawulf)
