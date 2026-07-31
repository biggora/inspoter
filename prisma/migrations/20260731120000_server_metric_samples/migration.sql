-- Server metric history: the time series behind the server detail page's
-- charts. Additive only — ServerMetricSnapshot keeps its "one current row per
-- server" role untouched, and this table accumulates every accepted push
-- alongside it.
--
-- The unique index on ("localServerId", "capturedAt") lets the ingest insert
-- with ON CONFLICT DO NOTHING, so a redelivered payload can never abort the
-- surrounding transaction. The plain index on "capturedAt" serves the
-- retention sweep, which deletes across all workspaces by age.

-- CreateTable
CREATE TABLE "ServerMetricSample" (
    "id" TEXT NOT NULL,
    "localServerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "cpuUsagePercent" DOUBLE PRECISION NOT NULL,
    "load1" DOUBLE PRECISION NOT NULL,
    "load5" DOUBLE PRECISION NOT NULL,
    "load15" DOUBLE PRECISION NOT NULL,
    "memoryTotalBytes" BIGINT NOT NULL,
    "memoryAvailableBytes" BIGINT NOT NULL,
    "swapTotalBytes" BIGINT NOT NULL,
    "swapFreeBytes" BIGINT NOT NULL,
    "filesystemTotalBytes" BIGINT NOT NULL,
    "filesystemAvailableBytes" BIGINT NOT NULL,
    "uptimeSeconds" BIGINT NOT NULL,

    CONSTRAINT "ServerMetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerMetricSample_localServerId_capturedAt_key" ON "ServerMetricSample"("localServerId", "capturedAt");

-- CreateIndex
CREATE INDEX "ServerMetricSample_workspaceId_localServerId_capturedAt_idx" ON "ServerMetricSample"("workspaceId", "localServerId", "capturedAt");

-- CreateIndex
CREATE INDEX "ServerMetricSample_capturedAt_idx" ON "ServerMetricSample"("capturedAt");

-- AddForeignKey
ALTER TABLE "ServerMetricSample" ADD CONSTRAINT "ServerMetricSample_localServerId_workspaceId_fkey" FOREIGN KEY ("localServerId", "workspaceId") REFERENCES "LocalServer"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
