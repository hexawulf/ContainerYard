# ContainerYard → DockYard Transformation Tasks
**Handoff Document for Claude Code Session**  
**Date:** October 13, 2025  
**Server:** Production PiApps Server  
**Project Location:** `/home/zk/projects/ContainerYard`  
**Live URL:** https://containeryard.org

---

## 🎯 Mission Overview

Transform the freshly deployed ContainerYard into a fully branded DockYard application that monitors real Docker containers from the Synology NAS at 192.168.50.147.

---

## ✅ Current State - What's Already Done

### Deployment Complete ✓
- ✅ ContainerYard deployed and running on port 5001
- ✅ Domain configured: containeryard.org
- ✅ SSL certificate obtained (Let's Encrypt)
- ✅ Nginx reverse proxy configured
- ✅ PostgreSQL database: `containeryard` (user: containeryard)
- ✅ PM2 ecosystem running (process name: containeryard)
- ✅ Build system working (Vite + TypeScript)
- ✅ Dependencies fixed (xterm migrated to @xterm/xterm)

### Infrastructure Details
**Location:** `/home/zk/projects/ContainerYard`  
**Port:** 5001  
**Database:** `postgresql://containeryard:containeryard_secure_pass_2025@localhost:5432/containeryard`  
**Process Manager:** PM2 with ecosystem.config.cjs  
**Current Provider:** SIMULATION (needs to change to DOCKER)

### PM2 Configuration
Located at: `/home/zk/projects/ContainerYard/ecosystem.config.cjs`
```javascript
module.exports = {
  apps: [{
    name: 'containeryard',
    script: 'npm',
    args: 'start',
    cwd: '/home/zk/projects/ContainerYard',
    env: {
      NODE_ENV: 'production',
      PORT: '5001',
      PROVIDER: 'SIMULATION',  // ← Currently SIMULATION, need to change to DOCKER
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://containeryard:containeryard_secure_pass_2025@localhost:5432/containeryard'
    }
  }]
};
```

### Nginx Configuration
Located at: `/etc/nginx/sites-available/containeryard.org.conf`
- HTTP → HTTPS redirect working ✓
- SSL configured ✓
- Proxy to localhost:5001 ✓

---

## 🎨 Task 1: Rebrand to DockYard

### Logo Integration
**User's Logo:** Uploaded image - crane/dock crane icon with "CONTAINER YARD" text  
**Goal:** Integrate this logo into the application branding

**Files to Update:**
```
client/public/
├── favicon.ico          ← Replace with DockYard favicon
├── logo.png            ← Add DockYard logo here
└── index.html          ← Update title/meta tags

client/src/
├── components/
│   ├── Header.tsx      ← Logo placement & branding
│   ├── Sidebar.tsx     ← Side navigation branding
│   └── Layout.tsx      ← Main layout component
└── App.tsx             ← App-level branding
```

**Steps:**
1. **Save the logo:**
   ```bash
   # User will provide logo file - save to:
   /home/zk/projects/ContainerYard/client/public/dockeryard-logo.png
   ```

2. **Update HTML title & meta:**
   ```bash
   nano /home/zk/projects/ContainerYard/index.html
   ```
   Change:
   - `<title>ContainerYard` → `<title>DockYard`
   - Meta description
   - Favicon reference

3. **Global text replacement:**
   ```bash
   cd /home/zk/projects/ContainerYard
   
   # Find all occurrences first
   grep -r "ContainerYard" client/src/ --include="*.tsx" --include="*.ts"
   
   # Replace in source files
   find client/src -type f \( -name "*.tsx" -o -name "*.ts" \) \
     -exec sed -i 's/ContainerYard/DockYard/g' {} \;
   
   # Update package.json
   sed -i 's/"name": ".*"/"name": "dockeryard"/g' package.json
   
   # Update index.html
   sed -i 's/ContainerYard/DockYard/g' index.html
   ```

4. **Update logo component:**
   ```bash
   # Find the logo/header component
   find client/src/components -name "*Header*" -o -name "*Logo*" -o -name "*Nav*"
   
   # Edit to use new logo
   # Look for <img> or <svg> tags and update src
   ```

5. **Rebuild & restart:**
   ```bash
   npm run build
   pm2 restart containeryard
   ```

### Color Scheme (Optional)
The logo uses a **dark blue/teal color scheme**. Consider updating:
- Tailwind config colors
- CSS variables
- Component theme colors

**File to check:**
```
client/src/
├── index.css           ← Global styles
└── tailwind.config.js  ← Tailwind theme
```

---

## 🐳 Task 2: Connect to Real Docker Containers

### Overview
Switch from SIMULATION mode to DOCKER mode and connect to:
1. **Local Docker** (if available on this server)
2. **Synology NAS Docker** at 192.168.50.147

### Current Docker Setup
**Known containers running:**
- Grafana (port 3000)
- Prometheus (port 9090)
- Freqtrade (crypto trading bot)

**Synology NAS:**
- IP: 192.168.50.147
- Has Dozzle running on port 9816
- Likely has other Docker containers

### Implementation Steps

#### Step 2A: Enable Local Docker Access

**Check Docker availability:**
```bash
# Check if Docker is installed
docker --version

# Check socket access
ls -la /var/run/docker.sock

# Test Docker access
docker ps
```

**Grant Docker access to user:**
```bash
# Add user to docker group
sudo usermod -aG docker zk

# Apply changes (may need to logout/login)
newgrp docker

# Test again
docker ps
```

#### Step 2B: Update Environment Configuration

**Update .env file:**
```bash
cd /home/zk/projects/ContainerYard

cat > .env <<'EOF'
PORT=5001
PROVIDER=DOCKER
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://containeryard:containeryard_secure_pass_2025@localhost:5432/containeryard
DOCKER_HOST=unix:///var/run/docker.sock
EOF
```

**Or update ecosystem.config.cjs:**
```bash
nano /home/zk/projects/ContainerYard/ecosystem.config.cjs
```

Change:
```javascript
PROVIDER: 'SIMULATION',  // ← Change this
```

To:
```javascript
PROVIDER: 'DOCKER',
DOCKER_HOST: 'unix:///var/run/docker.sock',
```

#### Step 2C: Connect to Synology Docker (Remote)

**Option 1: SSH Tunnel**
```bash
# Create SSH tunnel to Synology Docker
ssh -L 2375:localhost:2375 user@192.168.50.147 -N -f

# Then use:
DOCKER_HOST=tcp://localhost:2375
```

**Option 2: Direct TCP Connection** (if Synology Docker API enabled)
```bash
# Update .env or ecosystem.config.cjs
DOCKER_HOST=tcp://192.168.50.147:2375
```

**Option 3: Multi-Host Support** (Advanced)
DockYard might support multiple Docker hosts. Check the codebase for:
```bash
grep -r "DOCKER_HOST" server/src --include="*.ts"
grep -r "docker" server/src/config --include="*.ts"
```

#### Step 2D: Restart and Verify

```bash
# Restart DockYard
pm2 restart containeryard

# Watch logs
pm2 logs containeryard --lines 50

# Check if containers are showing up
curl http://localhost:5001/api/containers
# or whatever the API endpoint is
```

### Troubleshooting Docker Connection

**If containers don't show:**
1. Check Docker socket permissions: `ls -la /var/run/docker.sock`
2. Verify user in docker group: `groups zk`
3. Check logs: `pm2 logs containeryard --err`
4. Test Docker manually: `docker ps`

**For Synology connection:**
1. Verify SSH access: `ssh user@192.168.50.147`
2. Check if Docker API is enabled on Synology
3. Test connection: `docker -H tcp://192.168.50.147:2375 ps`

---

## 🐋 Task 3: Dockerize the Application

### Create Dockerfile

**Create the Dockerfile:**
```bash
cd /home/zk/projects/ContainerYard

cat > Dockerfile <<'EOF'
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with legacy peer deps flag)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --legacy-peer-deps --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:5001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production \
    PORT=5001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]
EOF
```

**Create .dockerignore:**
```bash
cat > .dockerignore <<'EOF'
node_modules
.git
.env
.env.local
.env.*.local
dist
*.log
.DS_Store
.pm2
.vscode
.idea
coverage
.next
.nuxt
.cache
.temp
*.md
README.md
Dockerfile
docker-compose.yml
.dockerignore
EOF
```

### Build Docker Image

```bash
cd /home/zk/projects/ContainerYard

# Build the image
docker build -t dockeryard:latest .

# Check image size
docker images | grep dockeryard
```

### Create docker-compose.yml

```bash
cat > docker-compose.yml <<'EOF'
version: '3.8'

services:
  dockeryard:
    image: dockeryard:latest
    container_name: dockeryard
    restart: unless-stopped
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
      - PORT=5001
      - PROVIDER=DOCKER
      - LOG_LEVEL=info
      - DATABASE_URL=postgresql://containeryard:containeryard_secure_pass_2025@host.docker.internal:5432/containeryard
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - dockeryard-network
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 40s

  db:
    image: postgres:17-alpine
    container_name: dockeryard-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=containeryard
      - POSTGRES_USER=containeryard
      - POSTGRES_PASSWORD=containeryard_secure_pass_2025
    volumes:
      - dockeryard-db-data:/var/lib/postgresql/data
    networks:
      - dockeryard-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U containeryard"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  dockeryard-network:
    driver: bridge

volumes:
  dockeryard-db-data:
    driver: local
EOF
```

### Test Docker Deployment

```bash
# Build and start with docker-compose
docker-compose up -d

# Check logs
docker-compose logs -f dockeryard

# Check status
docker-compose ps

# Test
curl http://localhost:5001

# Stop when done testing
docker-compose down
```

### Migration Strategy

**Option A: Keep PM2 (Recommended for now)**
- Keep running via PM2 as it is now
- Docker image ready for future deployment or other environments

**Option B: Switch to Docker**
1. Stop PM2: `pm2 stop containeryard && pm2 delete containeryard`
2. Start with docker-compose: `docker-compose up -d`
3. Update nginx if needed (should be same port 5001)

---

## 📝 Additional Tasks & Improvements

### Task 4: Update Domain/Branding References

**Update nginx config:**
```bash
# If you want to rename the domain later
sudo mv /etc/nginx/sites-available/containeryard.org.conf \
       /etc/nginx/sites-available/dockeryard.org.conf

# Update the config file itself
sudo nano /etc/nginx/sites-available/dockeryard.org.conf
# Change server_name to dockeryard.org if DNS configured
```

### Task 5: Add Monitoring Features

**Potential enhancements:**
- Connect to Prometheus for metrics
- Integrate with existing Grafana dashboards
- Add alerts for container status changes

### Task 6: Documentation

**Update README.md:**
```bash
cd /home/zk/projects/ContainerYard

# Create/update README with:
# - DockYard branding
# - Setup instructions
# - Docker connection details
# - Development guide
```

---

## 🔧 Important Files & Locations

### Project Structure
```
/home/zk/projects/ContainerYard/
├── client/                    # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/       # React components - UPDATE BRANDING HERE
│   │   ├── App.tsx          # Main app component
│   │   └── index.css        # Global styles
│   └── public/              # Static assets - ADD LOGO HERE
├── server/                   # Backend (Node + Express)
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── routes/          # API routes
│   │   └── services/        # Docker service layer
│   └── index.ts             # Server entry point
├── dist/                     # Built files (after npm run build)
├── .env                      # Environment variables (UPDATE PROVIDER)
├── ecosystem.config.cjs      # PM2 configuration (UPDATE PROVIDER)
├── package.json              # Dependencies
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

### Configuration Files
```
/.env                                    # Environment variables
/ecosystem.config.cjs                    # PM2 config (IMPORTANT)
/package.json                            # Project metadata
/index.html                              # Main HTML (UPDATE TITLE)
/Dockerfile                              # Docker build instructions (TO CREATE)
/docker-compose.yml                      # Docker compose (TO CREATE)
```

### System Files
```
/etc/nginx/sites-available/containeryard.org.conf    # Nginx config
/var/log/nginx/containeryard.org.access.log          # Access logs
/var/log/nginx/containeryard.org.error.log           # Error logs
/home/zk/.pm2/logs/containeryard-error.log           # PM2 error logs
/home/zk/.pm2/logs/containeryard-out.log             # PM2 output logs
```

---

## 🚀 Commands Cheat Sheet

### Development
```bash
cd /home/zk/projects/ContainerYard

# Install dependencies
npm install --legacy-peer-deps

# Development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

### PM2 Management
```bash
# View status
pm2 status

# View logs
pm2 logs containeryard
pm2 logs containeryard --lines 50
pm2 logs containeryard --err

# Restart
pm2 restart containeryard

# Reload (zero-downtime)
pm2 reload containeryard

# Stop
pm2 stop containeryard

# Delete
pm2 delete containeryard

# Start from ecosystem config
pm2 start ecosystem.config.cjs

# Save current PM2 state
pm2 save

# Monitor
pm2 monit
```

### Nginx Management
```bash
# Test configuration
sudo nginx -t

# Reload (graceful)
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# Status
sudo systemctl status nginx

# View logs
sudo tail -f /var/log/nginx/containeryard.org.access.log
sudo tail -f /var/log/nginx/containeryard.org.error.log
```

### Docker Commands
```bash
# List containers
docker ps
docker ps -a

# List images
docker images

# Build image
docker build -t dockeryard:latest .

# Run container
docker run -d --name dockeryard -p 5001:5001 dockeryard:latest

# View logs
docker logs dockeryard
docker logs -f dockeryard

# Execute command in container
docker exec -it dockeryard sh

# Stop container
docker stop dockeryard

# Remove container
docker rm dockeryard

# Docker compose
docker-compose up -d
docker-compose down
docker-compose logs -f
docker-compose ps
```

### Database Commands
```bash
# Connect to database
psql -U containeryard -d containeryard -h localhost

# List databases
sudo -u postgres psql -c "\l"

# List tables
psql -U containeryard -d containeryard -c "\dt"

# Backup database
pg_dump -U containeryard containeryard > backup.sql

# Restore database
psql -U containeryard containeryard < backup.sql
```

### Testing
```bash
# Test local
curl http://localhost:5001
curl http://localhost:5001/health

# Test domain (HTTP)
curl http://containeryard.org

# Test domain (HTTPS)
curl https://containeryard.org
curl -I https://containeryard.org

# Test API endpoints
curl http://localhost:5001/api/containers
curl http://localhost:5001/api/status
```

---

## 🎯 Session Checklist

Use this checklist during the Claude Code session:

### Phase 1: Branding ✓
- [ ] Save DockYard logo to `client/public/`
- [ ] Update `index.html` title and meta tags
- [ ] Find and update Header/Logo component
- [ ] Global text replacement: ContainerYard → DockYard
- [ ] Update `package.json` name field
- [ ] Rebuild: `npm run build`
- [ ] Restart: `pm2 restart containeryard`
- [ ] Verify at https://containeryard.org

### Phase 2: Docker Connection ✓
- [ ] Check Docker availability: `docker ps`
- [ ] Add user to docker group: `sudo usermod -aG docker zk`
- [ ] Update `.env` or `ecosystem.config.cjs` with `PROVIDER=DOCKER`
- [ ] Set `DOCKER_HOST=unix:///var/run/docker.sock`
- [ ] Restart: `pm2 restart containeryard`
- [ ] Verify containers appear in dashboard
- [ ] Test Synology connection (if applicable)

### Phase 3: Dockerization ✓
- [ ] Create `Dockerfile`
- [ ] Create `.dockerignore`
- [ ] Create `docker-compose.yml`
- [ ] Build image: `docker build -t dockeryard:latest .`
- [ ] Test image: `docker run ...`
- [ ] Test with docker-compose (optional)
- [ ] Document deployment options

### Phase 4: Testing & Verification ✓
- [ ] All branding updated
- [ ] Real Docker containers visible
- [ ] No console errors
- [ ] All features working
- [ ] Logs clean: `pm2 logs containeryard`
- [ ] Health check passing: `curl http://localhost:5001/health`

---

## 🐛 Troubleshooting Guide

### Build Fails
**Problem:** `npm run build` fails  
**Solutions:**
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# Check for TypeScript errors
npm run build 2>&1 | tee build-errors.log
```

### PM2 Won't Start
**Problem:** `pm2 restart containeryard` fails  
**Solutions:**
```bash
# Check logs
pm2 logs containeryard --err --lines 50

# Delete and recreate
pm2 delete containeryard
pm2 start ecosystem.config.cjs

# Verify .env exists
cat .env

# Check port availability
sudo lsof -i :5001
```

### Docker Connection Fails
**Problem:** Containers not showing in dashboard  
**Solutions:**
```bash
# Verify Docker access
docker ps

# Check user groups
groups zk

# Relogin if needed
su - zk

# Check socket permissions
ls -la /var/run/docker.sock

# Test socket manually
curl --unix-socket /var/run/docker.sock http://localhost/containers/json
```

### Database Connection Issues
**Problem:** Database errors in logs  
**Solutions:**
```bash
# Verify database exists
sudo -u postgres psql -c "\l" | grep containeryard

# Test connection
psql -U containeryard -d containeryard -h localhost -c "SELECT 1;"

# Check DATABASE_URL in config
cat ecosystem.config.cjs | grep DATABASE_URL
```

### Nginx Issues
**Problem:** Site not accessible  
**Solutions:**
```bash
# Test config
sudo nginx -t

# Check if running
sudo systemctl status nginx

# Restart nginx
sudo systemctl restart nginx

# Check logs
sudo tail -50 /var/log/nginx/error.log
```

---

## 📚 Reference Documentation

### Project Structure Details

**Frontend (client/):**
- **React 18** with **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Lucide React** for icons

**Backend (server/):**
- **Node.js** with **Express**
- **TypeScript**
- **PostgreSQL** for database
- Docker SDK for container monitoring

**Key Dependencies:**
- `@xterm/xterm` - Terminal emulator
- `express` - Web framework
- `pg` - PostgreSQL client
- Docker SDK (check package.json for actual name)

### Environment Variables

**Required:**
- `PORT` - Server port (5001)
- `NODE_ENV` - Environment (production/development)
- `DATABASE_URL` - PostgreSQL connection string
- `PROVIDER` - Data source (DOCKER/SIMULATION)
- `LOG_LEVEL` - Logging verbosity

**Optional:**
- `DOCKER_HOST` - Docker daemon address
- `DOCKER_CERT_PATH` - TLS certificates path (if using TLS)
- `DOCKER_TLS_VERIFY` - Enable TLS verification

### API Endpoints (Estimated)

These are typical endpoints for a Docker monitoring app:
```
GET  /health                  - Health check
GET  /api/containers          - List all containers
GET  /api/containers/:id      - Get container details
POST /api/containers/:id/logs - Get container logs
POST /api/containers/:id/exec - Execute command
GET  /api/images              - List images
GET  /api/stats               - System stats
```

*Note: Verify actual endpoints in the codebase*

---

## 💡 Tips for Claude Code Session

1. **Start with branding** - It's visual and confirms changes work
2. **Test incrementally** - Rebuild and restart after each major change
3. **Keep PM2 logs open** - `pm2 logs containeryard -f` in a separate terminal
4. **Backup before major changes** - `cp -r /home/zk/projects/ContainerYard /home/zk/projects/ContainerYard.backup`
5. **Use git** - Commit changes as you go (if git is initialized)

### Useful One-Liners

```bash
# Watch logs live
watch -n 1 'pm2 status | grep containeryard'

# Monitor nginx
sudo tail -f /var/log/nginx/containeryard.org.access.log | grep -v "health"

# Quick rebuild & restart
npm run build && pm2 restart containeryard && pm2 logs containeryard --lines 20

# Find all TODO/FIXME comments
grep -r "TODO\|FIXME" client/src server/src --include="*.ts" --include="*.tsx"
```

---

## 🎉 Success Criteria

You'll know everything is working when:

✅ **Branding:**
- Site shows "DockYard" instead of "ContainerYard"
- Your crane logo is visible in the header
- Browser tab shows correct title and favicon

✅ **Docker Connection:**
- Dashboard shows real running containers (not simulated)
- Can see Grafana, Prometheus, Freqtrade containers
- Live logs streaming from containers
- Container stats updating in real-time

✅ **Dockerization:**
- Docker image builds successfully
- Can run application in container
- docker-compose.yml tested (optional)

✅ **Stability:**
- No errors in PM2 logs
- Site loads fast at https://containeryard.org
- All features functional
- Database queries working

---

## 📞 If You Get Stuck

**Check these in order:**

1. **Logs:** `pm2 logs containeryard --lines 50`
2. **Status:** `pm2 status`
3. **Build:** Try rebuilding: `npm run build`
4. **Config:** Verify `ecosystem.config.cjs` has correct settings
5. **Permissions:** Check file permissions: `ls -la`
6. **Port:** Ensure nothing else on port 5001: `sudo lsof -i :5001`
7. **Database:** Test connection: `psql -U containeryard -d containeryard -h localhost`
8. **Docker:** Test access: `docker ps`

**Common Issues:**
- **Build fails:** Usually dependency issues → `npm install --legacy-peer-deps`
- **Won't start:** Usually env vars → check `ecosystem.config.cjs`
- **Can't connect to Docker:** Usually permissions → `sudo usermod -aG docker zk`
- **Database errors:** Usually wrong password → check `DATABASE_URL`

---

## 🎊 Final Notes

**This is a well-structured project!** The codebase uses modern tools and patterns:
- TypeScript for type safety
- Vite for fast builds
- React 18 with hooks
- Tailwind for styling
- PM2 for process management
- PostgreSQL for persistence

**Infrastructure is solid:**
- 8 applications running smoothly
- Professional Nginx setup
- SSL certificates managed
- Proper logging in place
- Database configured

**You're in good shape to make these changes!** The foundation is strong, now we're just customizing the branding and connecting to real data sources.

---

**Good luck with the Claude Code session!** 🚀

*This document will serve as your complete reference. Save it, share it with Claude Code, and use it as a checklist as you work through the tasks.*

---

**Document Created:** October 13, 2025  
**For:** Claude Code session on PiApps server  
**Project:** ContainerYard → DockYard transformation  
**Status:** Ready to begin! ✨
