[![Website](https://img.shields.io/badge/website-containeryard.org-blue)](https://containeryard.org)
[![GitHub](https://img.shields.io/github/stars/hexawulf/ContainerYard?style=social)](https://github.com/hexawulf/ContainerYard)

# ContainerYard 🐳

> A modern, log-first Docker container observability and debugging dashboard

ContainerYard is a powerful, developer-focused observability tool inspired by Dozzle, designed for real-time Docker container monitoring, log analysis, and debugging. Built with React 18 and Express, it provides a sleek interface for managing containers, analyzing logs, and troubleshooting issues—all optimized for modern developer workflows.

![ContainerYard Dashboard](https://github.com/hexawulf/ContainerYard/blob/main/attached_assets/screenshot.png?raw=true)
*Screenshot placeholder"

## ✨ Features

### Core Features
- 🔴 **Real-time Container Monitoring** - Live status updates, metrics, and health checks
- 📜 **Advanced Log Streaming** - Virtual scrolling for performance with large log datasets
- 🔍 **Powerful Search & Filtering** - Regex support, log level filtering, and custom DSL queries
- 📊 **Performance Metrics** - CPU, memory, and network visualization with interactive timelines
- 💻 **Integrated Terminal** - Web-based shell access for container debugging
- ⌨️ **Keyboard Shortcuts** - Navigate efficiently with keyboard-driven controls
- 🌓 **Dark/Light Mode** - Beautiful themes optimized for log readability

### Advanced Features
- 🎨 **Multi-Container Log Interleaving** - Stream and compare logs from up to 3 containers simultaneously with color-coding
- 🔖 **Log Moments Bookmarks** - Save timestamped log moments with notes and shareable deep-links
- 📊 **JSON Field Detection** - Auto-parse structured logs with interactive field chips for pivoting
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

### Database (Optional)
- **PostgreSQL** - For saved searches and bookmarks
- **Neon Serverless** - Serverless PostgreSQL driver

## 📚 Documentation

- [Deployment Guide](DEPLOYMENT.md) - Production deployment instructions
- [Environment Variables](.env.example) - Configuration reference
- [Architecture](replit.md) - Technical architecture details

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
