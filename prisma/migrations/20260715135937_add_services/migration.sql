-- CreateEnum
CREATE TYPE "MonitorType" AS ENUM ('HTTP', 'TCP', 'PING');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'UP', 'DOWN');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monitorType" "MonitorType" NOT NULL,
    "url" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "expectedStatusCodes" TEXT,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "retries" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentStatus" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastResponseTimeMs" INTEGER,
    "lastMessage" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCheck" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceWorkspaceId" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL,
    "responseTimeMs" INTEGER,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_workspaceId_name_idx" ON "Service"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Service_isActive_nextCheckAt_idx" ON "Service"("isActive", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_workspaceId_key" ON "Service"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "ServiceCheck_workspaceId_serviceId_checkedAt_id_idx" ON "ServiceCheck"("workspaceId", "serviceId", "checkedAt", "id");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCheck" ADD CONSTRAINT "ServiceCheck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCheck" ADD CONSTRAINT "ServiceCheck_serviceId_serviceWorkspaceId_fkey" FOREIGN KEY ("serviceId", "serviceWorkspaceId") REFERENCES "Service"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
