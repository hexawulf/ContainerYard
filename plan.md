# ContainerYard Phase 1 Relaunch Plan

## **Top 3 Phase 1 Features for ContainerYard Relaunch**

Based on codebase analysis, here are the three functionalities that will **maximize utility and differentiation** for ContainerYard:

---

### **1. Docker Compose Stack Management** 🎯 *Highest Impact*

**Why this is critical:**
- Your current implementation only handles **individual containers**, but real production environments use Docker Compose stacks
- This is the #1 pain point developers face: managing multi-container applications as a unit
- **Dozzle doesn't have this** - instant competitive advantage

**What to build:**
```
Features:
- Detect Docker Compose projects (via labels: com.docker.compose.project)
- Group containers by stack in the UI
- Bulk operations: start/stop/restart entire stack
- View compose.yml configuration
- Stack-level health indicators (how many containers up/down)
- Combined logs from all stack containers (already have multi-log viewer!)
```

**Technical approach:**
- Extend `ContainerSummary` schema to include `composeProject` field
- Add new route: `/api/stacks` that aggregates containers by project label
- Reuse your existing multi-container log interleaving for stack logs
- Add "Stack View" toggle to Dashboard (alongside container list)

**User value:** 
- Developers can manage their entire app (nginx + api + db + redis) as one unit
- Reduces clicks from ~12 (managing 4 containers individually) to 2 (one stack action)

---

### **2. Alert Rules & Webhooks** 📢 *High Impact + Monetization*

**Why this is critical:**
- Observability without alerting is just "looking" - teams need proactive notifications
- This transforms ContainerYard from a **viewer** to a **monitoring solution**
- Clear freemium upsell: basic alerts free, unlimited alerts = paid tier

**What to build:**
```
Features:
- Define alert rules:
  * CPU > X% for Y minutes
  * Memory > X% for Y minutes  
  * Container restarted > X times in Y minutes
  * Container status changed (running → exited)
  * Log pattern matched (e.g., "ERROR", "FATAL", custom regex)

- Notification channels:
  * Webhook (Slack, Discord, generic HTTP POST)
  * Email (via SMTP or SendGrid)
  * Browser push notifications (already have infra)

- Alert management UI:
  * Create/edit/delete rules
  * Alert history/audit log
  * Acknowledge/snooze alerts
  * Test webhook before saving
```

**Technical approach:**
- New DB tables: `alert_rules`, `alert_history`, `notification_channels`
- Background worker checks rules every 30s against metrics/logs
- Debouncing to prevent spam (e.g., CPU spike → single alert, not 20)
- Use existing PostgreSQL + Drizzle ORM

**User value:**
- Get Slack message when production container crashes
- Catch memory leaks before they kill the server
- Track deployment health automatically

**Monetization path:**
```
Free tier:  3 alert rules, 100 notifications/month
Pro tier:   Unlimited rules, unlimited notifications, priority support
```

---

### **3. Container Health Dashboard with Trends** 📊 *Medium-High Impact*

**Why this is critical:**
- Your current stats show **real-time only** (30 data points = ~1 minute of history)
- Teams need to answer: "Was CPU high at 3am?" or "What caused the spike yesterday?"
- **Historical data = debugging power** - critical for post-mortems

**What to build:**
```
Features:
- Time-series metrics storage (last 7/30/90 days configurable)
- Historical charts:
  * CPU/Memory trends over time
  * Network I/O patterns
  * Container restart timeline
  * Log volume heatmap (you already have this idea in README!)

- Dashboard widgets:
  * "Top 5 CPU consumers this week"
  * "Containers with most restarts"
  * "Healthiest/unhealthiest containers"
  * Quick stats: uptime %, avg CPU/mem, trend arrows (↑↓)

- Exportable reports:
  * CSV export of metrics
  * PDF summary for weekly reviews
```

**Technical approach:**
- **Don't build a time-series DB** - use existing PostgreSQL with partitioning
- Table: `container_metrics_hourly` (aggregate stats per hour, keep 90 days)
- Background job: every hour, aggregate last 60min of stats into 1 row
- Use your existing `NormalizedStats` type but with `aggregatedAt` timestamp
- Recharts library (already in dependencies) for visualization

**User value:**
- Correlate issues: "Oh, CPU spiked when we deployed at 2pm"
- Capacity planning: "We'll need more RAM in 2 months at this growth rate"
- Prove SLAs to stakeholders with uptime reports

---

## **Why NOT These Features:**

**Kubernetes support** - Too complex for Phase 1, smaller market overlap than Docker Compose

**Log parsing plugins** - Interesting but niche; alerts solve the same problem better

**Team/collaboration** - Adds auth complexity; focus on features first, multi-user later

**Browser extension** - Nice-to-have, not core utility

---

## **Implementation Roadmap (Phase 1 = 4-6 weeks)**

### Week 1-2: Docker Compose Stack Management
- Day 1-3: Backend API for stack detection/grouping
- Day 4-7: UI for stack view with bulk actions  
- Day 8-10: Stack logs viewer (reuse multi-container logs)
- Day 11-14: Polish, testing, docs

### Week 3-4: Alert Rules & Webhooks
- Day 1-4: Database schema + CRUD API for rules
- Day 5-8: Background worker + webhook sender
- Day 9-11: Alert rules UI (create/edit/test)
- Day 12-14: Alert history viewer + docs

### Week 5-6: Health Dashboard with Trends
- Day 1-4: Metrics aggregation job + storage
- Day 5-9: Historical charts implementation
- Day 10-12: Dashboard widgets + top/worst lists
- Day 13-14: Export features + polish

---

## **Marketing Positioning After Phase 1:**

**Before:** "Docker log viewer"  
**After:** "Complete Docker stack monitoring platform"

**Key differentiators:**
1. ✅ **Stack-aware** - Manage Docker Compose apps as units (Dozzle can't)
2. ✅ **Proactive alerts** - Know about issues before users complain (Portainer Lite can't)
3. ✅ **Historical trends** - Debug past incidents, not just current state (Dozzle can't)

This positions you between lightweight viewers (Dozzle) and heavyweight platforms (Datadog, New Relic) - the **Goldilocks zone** for teams running 5-50 containers.

---

## **Bottom Line**

These three features transform ContainerYard from a "nice log viewer" into a **mission-critical monitoring tool** that teams will pay for. They leverage your existing strengths (multi-container logs, clean UI) while filling critical gaps in the Docker tooling ecosystem.

---

## **Current State Analysis**

### Existing Strengths
- ✅ Multi-provider architecture (MOCK/SIMULATION/REMOTE)
- ✅ Real-time log streaming with WebSockets
- ✅ Multi-container log interleaving
- ✅ Interactive terminal (exec) support
- ✅ Clean UI with Shadcn/ui components
- ✅ PostgreSQL for saved searches & bookmarks
- ✅ Prometheus metrics endpoint
- ✅ E2E testing with Playwright
- ✅ Security hardening (rate limiting, CSRF protection)

### Current Limitations
- ❌ No Docker Compose/stack awareness
- ❌ No alerting or proactive monitoring
- ❌ No historical metrics (only last ~1 minute)
- ❌ No trend analysis or reporting
- ❌ Limited differentiation from Dozzle

### Market Gap
ContainerYard sits in the perfect position to fill the gap between:
- **Too simple**: Dozzle (just logs), docker stats (just CLI)
- **Too complex**: Datadog ($15-31/host/month), New Relic, Prometheus+Grafana stack

**Target market**: Teams running 5-50 containers who need more than logs but don't want enterprise complexity.
