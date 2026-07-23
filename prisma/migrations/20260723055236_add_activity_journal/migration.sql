-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "details" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_workspaceId_timestamp_id_idx" ON "Activity"("workspaceId", "timestamp", "id");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_action_timestamp_id_idx" ON "Activity"("workspaceId", "action", "timestamp", "id");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_entityType_timestamp_id_idx" ON "Activity"("workspaceId", "entityType", "timestamp", "id");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_operatorId_timestamp_id_idx" ON "Activity"("workspaceId", "operatorId", "timestamp", "id");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
