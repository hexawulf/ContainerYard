-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" TEXT NOT NULL DEFAULT 'true',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditionType" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "containerFilter" TEXT,
    "channelId" INTEGER NOT NULL,
    "enabled" TEXT NOT NULL DEFAULT 'true',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ruleId" INTEGER NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContainerMetricsHourly" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hostId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "aggregatedAt" DATETIME NOT NULL,
    "avgCpuPercent" TEXT NOT NULL,
    "maxCpuPercent" TEXT NOT NULL,
    "avgMemoryPercent" TEXT NOT NULL,
    "maxMemoryPercent" TEXT NOT NULL,
    "avgMemoryBytes" TEXT NOT NULL,
    "maxMemoryBytes" TEXT NOT NULL,
    "totalNetworkRx" TEXT NOT NULL,
    "totalNetworkTx" TEXT NOT NULL,
    "totalBlockRead" TEXT NOT NULL,
    "totalBlockWrite" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContainerRestart" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hostId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "restartReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NotificationChannel_createdAt_idx" ON "NotificationChannel"("createdAt");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertRule_createdAt_idx" ON "AlertRule"("createdAt");

-- CreateIndex
CREATE INDEX "AlertHistory_ruleId_containerId_createdAt_idx" ON "AlertHistory"("ruleId", "containerId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertHistory_createdAt_idx" ON "AlertHistory"("createdAt");

-- CreateIndex
CREATE INDEX "ContainerMetricsHourly_hostId_containerId_aggregatedAt_idx" ON "ContainerMetricsHourly"("hostId", "containerId", "aggregatedAt");

-- CreateIndex
CREATE INDEX "ContainerMetricsHourly_hostId_aggregatedAt_idx" ON "ContainerMetricsHourly"("hostId", "aggregatedAt");

-- CreateIndex
CREATE INDEX "ContainerRestart_hostId_containerId_createdAt_idx" ON "ContainerRestart"("hostId", "containerId", "createdAt");

-- CreateIndex
CREATE INDEX "ContainerRestart_createdAt_idx" ON "ContainerRestart"("createdAt");
