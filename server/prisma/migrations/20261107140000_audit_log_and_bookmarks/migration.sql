-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "hostId" TEXT,
    "target" TEXT,
    "detail" TEXT,
    "ip" TEXT
);

-- CreateTable
CREATE TABLE "LogBookmark" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "note" TEXT,
    "filters" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "LogBookmark_userId_createdAt_idx" ON "LogBookmark"("userId", "createdAt");

