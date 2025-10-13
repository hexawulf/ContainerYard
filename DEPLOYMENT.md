# ContainerYard Deployment Guide

This guide covers deploying ContainerYard in various environments, from local development to production deployments.

## Table of Contents
- [Local Development](#local-development)
- [Building for Production](#building-for-production)
- [Deployment Options](#deployment-options)
  - [Vercel](#deploying-to-vercel)
  - [Railway](#deploying-to-railway)
  - [Netlify](#deploying-to-netlify)
  - [Self-Hosted](#self-hosted-deployment)
- [Remote Agent Setup](#remote-agent-setup)
  - [Synology NAS](#synology-nas-setup)
  - [Raspberry Pi](#raspberry-pi-setup)
- [Docker Containerization](#docker-containerization-future)
- [Environment Configuration](#environment-configuration)

---

## Local Development

### Prerequisites
- Node.js 18+ and npm
- (Optional) Docker daemon for REMOTE provider
- (Optional) PostgreSQL for saved searches

### Quick Start

```bash
# Clone and install
git clone git@github.com:hexawulf/ContainerYard.git
cd ContainerYard
npm install

# Configure environment
cp .env.example .env

# Start development server
npm run dev
```

Access at: `http://localhost:3000` (or configured PORT)

### Development with Mock Data

Set `PROVIDER=MOCK` in `.env` - no Docker needed!

```bash
PROVIDER=MOCK
PORT=3000
NODE_ENV=development
```

---

## Building for Production

### Build the Application

```bash
# Install dependencies
npm install

# Build frontend and backend
npm run build
```

This creates optimized production files in `dist/`.

### Production Environment Variables

Create a production `.env`:

```bash
NODE_ENV=production
PORT=3000
PROVIDER=REMOTE
DOCKER_HOST=http://your-docker-host:2375
DOCKER_AUTH_TOKEN=your-secure-token
ALLOWED_ORIGINS=https://yourdomain.com
DATABASE_URL=postgresql://user:pass@host:5432/containeryard
SESSION_SECRET=your-secure-random-string
```

---

## Deployment Options

### Deploying to Vercel

Vercel is ideal for the frontend, but requires a separate backend deployment.

1. **Deploy Frontend:**
```bash
npm install -g vercel
vercel
```

2. **Configure Environment Variables** in Vercel dashboard:
```
VITE_API_URL=https://your-backend-url.com
```

3. **Deploy Backend Separately** (see Railway or self-hosted)

### Deploying to Railway

Railway supports full-stack Node.js applications perfectly.

1. **Install Railway CLI:**
```bash
npm install -g @railway/cli
railway login
```

2. **Initialize and Deploy:**
```bash
railway init
railway up
```

3. **Set Environment Variables** in Railway dashboard:
```
NODE_ENV=production
PROVIDER=REMOTE
DOCKER_HOST=http://your-docker-host:2375
DOCKER_AUTH_TOKEN=your-token
ALLOWED_ORIGINS=https://your-railway-app.railway.app
DATABASE_URL=postgresql://...
SESSION_SECRET=random-secret
```

4. **Configure Domain** in Railway dashboard

### Deploying to Netlify

Similar to Vercel - frontend only, requires separate backend.

1. **Deploy:**
```bash
npm install -g netlify-cli
netlify deploy --prod
```

2. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`

3. **Set environment variables** in Netlify dashboard

### Self-Hosted Deployment

Perfect for running on your own server, VPS, or homelab.

#### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Build the application
npm run build

# Start with PM2
pm2 start server/index.js --name containeryard

# Enable startup script
pm2 startup
pm2 save
```

#### Using systemd (Linux)

Create `/etc/systemd/system/containeryard.service`:

```ini
[Unit]
Description=ContainerYard Docker Dashboard
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ContainerYard
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable containeryard
sudo systemctl start containeryard
```

#### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name containeryard.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Remote Agent Setup

For monitoring Docker containers on remote hosts (NAS, Raspberry Pi, servers).

### Prerequisites

1. **Enable Docker API** on target host
2. **Configure CORS** for security
3. **Set authentication token** (recommended)

### Synology NAS Setup

#### Step 1: Enable Docker API

1. SSH into your Synology NAS:
```bash
ssh admin@your-nas-ip
```

2. Edit Docker daemon config:
```bash
sudo vi /var/packages/Docker/etc/dockerd.json
```

3. Add hosts configuration:
```json
{
  "data-root": "/volume1/@docker",
  "hosts": [
    "unix:///var/run/docker.sock",
    "tcp://0.0.0.0:2375"
  ]
}
```

4. Restart Docker:
```bash
sudo synoservicectl --restart pkgctl-Docker
```

#### Step 2: Configure Firewall

Add firewall rule to allow port 2375 from your ContainerYard host only.

#### Step 3: ContainerYard Configuration

```bash
PROVIDER=REMOTE
DOCKER_HOST=http://your-nas-ip:2375
ALLOWED_ORIGINS=https://your-containeryard-domain.com
```

### Raspberry Pi Setup

#### Step 1: Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

#### Step 2: Enable Docker API

Edit `/etc/docker/daemon.json`:

```json
{
  "hosts": [
    "unix:///var/run/docker.sock",
    "tcp://0.0.0.0:2375"
  ]
}
```

Override systemd service:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
```

Create `/etc/systemd/system/docker.service.d/override.conf`:

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
```

Restart Docker:

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

#### Step 3: Security (Optional but Recommended)

Generate TLS certificates for secure communication:

```bash
# Generate CA and certificates
openssl genrsa -out ca-key.pem 4096
openssl req -new -x509 -days 365 -key ca-key.pem -sha256 -out ca.pem
```

Configure Docker for TLS and set `DOCKER_AUTH_TOKEN` environment variable.

### Security Best Practices

1. **Use TLS encryption** for Docker API
2. **Set authentication tokens** via `DOCKER_AUTH_TOKEN`
3. **Restrict ALLOWED_ORIGINS** to your dashboard domain only
4. **Use firewall rules** to limit access to port 2375
5. **Consider VPN** for accessing remote Docker hosts
6. **Regular security updates** on all hosts

---

## Docker Containerization (Future)

### Dockerfile (Coming Soon)

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
RUN npm ci --production
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### Docker Compose (Coming Soon)

```yaml
version: '3.8'
services:
  containeryard:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PROVIDER=REMOTE
      - DOCKER_HOST=http://host.docker.internal:2375
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment | `development` | No |
| `PROVIDER` | Data source | `MOCK` | Yes |

### Provider-Specific Variables

#### REMOTE Provider

| Variable | Description | Required |
|----------|-------------|----------|
| `DOCKER_HOST` | Docker API endpoint | Yes |
| `DOCKER_AUTH_TOKEN` | Bearer token | No |
| `ALLOWED_ORIGINS` | CORS origins | Yes |

#### Database (Optional)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection | For saved searches |
| `SESSION_SECRET` | Session encryption key | For sessions |

### Provider Configuration Examples

#### MOCK (Development/Demo)
```bash
PROVIDER=MOCK
PORT=3000
```

#### SIMULATION (Testing)
```bash
PROVIDER=SIMULATION
PORT=3000
```

#### REMOTE (Production)
```bash
PROVIDER=REMOTE
DOCKER_HOST=http://docker-host:2375
DOCKER_AUTH_TOKEN=secret-token
ALLOWED_ORIGINS=https://containeryard.yourdomain.com
DATABASE_URL=postgresql://user:pass@db:5432/containeryard
SESSION_SECRET=random-secret-key
```

---

## Monitoring & Maintenance

### Health Checks

ContainerYard exposes health endpoints:

- `GET /api/health` - Application health
- `GET /api/containers` - Container list (verifies provider)

### Logs

```bash
# PM2 logs
pm2 logs containeryard

# Systemd logs
journalctl -u containeryard -f

# Docker logs (if containerized)
docker logs -f containeryard
```

### Performance Tuning

1. **Enable PostgreSQL** for persistent saved searches
2. **Configure log retention** in provider settings
3. **Use WebSocket compression** for log streaming
4. **Implement rate limiting** for API endpoints

---

## Troubleshooting

### Common Issues

**Cannot connect to Docker API:**
- Verify Docker daemon is running
- Check Docker API is enabled on port 2375
- Ensure firewall allows connection
- Verify `DOCKER_HOST` URL is correct

**CORS errors:**
- Add your domain to `ALLOWED_ORIGINS`
- Include protocol (http:// or https://)
- Check for trailing slashes

**WebSocket connection fails:**
- Ensure reverse proxy supports WebSocket upgrades
- Check `Upgrade` and `Connection` headers
- Verify firewall allows WebSocket connections

---

## Support

For issues and questions:
- GitHub Issues: https://github.com/hexawulf/ContainerYard/issues
- Documentation: https://github.com/hexawulf/ContainerYard

---

Made with ❤️ by [hexawulf](https://github.com/hexawulf)
