ALTER TABLE "Agent" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Skill" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "AgentSchedule" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "Agent_workspaceId_systemKey_key" ON "Agent"("workspaceId", "systemKey");
CREATE UNIQUE INDEX "Skill_workspaceId_systemKey_key" ON "Skill"("workspaceId", "systemKey");
CREATE UNIQUE INDEX "AgentSchedule_workspaceId_systemKey_key" ON "AgentSchedule"("workspaceId", "systemKey");
CREATE INDEX "WebhookDelivery_webhookId_eventKey_idx" ON "WebhookDelivery"("webhookId", "eventKey");
CREATE UNIQUE INDEX "WebhookDelivery_webhookId_eventKey_key"
  ON "WebhookDelivery"("webhookId", "eventKey")
  WHERE "eventKey" IS NOT NULL;

CREATE TYPE "ExecutiveBriefPeriod" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "ExecutiveBriefGenerationStatus" AS ENUM ('PENDING', 'SNAPSHOT_READY', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "DecisionOrigin" AS ENUM ('MANUAL', 'EXECUTIVE_BRIEF');
CREATE TYPE "DecisionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "DecisionStatus" AS ENUM ('OPEN', 'DEFERRED', 'APPROVED', 'REJECTED');
CREATE TYPE "DecisionActionType" AS ENUM ('CREATE_KANBAN_CARD', 'CREATE_REMINDER', 'CREATE_NOTE', 'CREATE_MAIL_DRAFT');
CREATE TYPE "DecisionExecutionStatus" AS ENUM ('NONE', 'READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_REBIND');
CREATE TYPE "DecisionEventType" AS ENUM ('CREATED', 'UPDATED', 'DEFERRED', 'APPROVED', 'REJECTED', 'ACTION_REBOUND', 'ACTION_STARTED', 'PRIMARY_COMMITTED', 'ACTION_FAILED', 'ACTION_RETRIED', 'BRIEF_LINKED');
CREATE TYPE "DecisionActorKind" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM', 'IMPORT');
CREATE TYPE "DecisionTargetAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

CREATE TABLE "ExecutiveBriefGeneration" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "period" "ExecutiveBriefPeriod" NOT NULL,
  "status" "ExecutiveBriefGenerationStatus" NOT NULL DEFAULT 'PENDING',
  "sourceAgentRunId" TEXT,
  "sourceAgentRunWorkspaceId" TEXT,
  "sourceRunId" TEXT NOT NULL,
  "sourceAgentId" TEXT NOT NULL,
  "sourceAgentName" TEXT NOT NULL,
  "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB,
  "snapshotHash" TEXT,
  "snapshotByteLength" INTEGER,
  "snapshotCapturedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutiveBriefGeneration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExecutiveBriefGeneration_run_pair_check" CHECK (
    ("sourceAgentRunId" IS NULL AND "sourceAgentRunWorkspaceId" IS NULL)
    OR
    ("sourceAgentRunId" IS NOT NULL AND "sourceAgentRunWorkspaceId" = "workspaceId")
  ),
  CONSTRAINT "ExecutiveBriefGeneration_snapshot_size_check" CHECK (
    "snapshotByteLength" IS NULL OR ("snapshotByteLength" >= 0 AND "snapshotByteLength" <= 131072)
  ),
  CONSTRAINT "ExecutiveBriefGeneration_state_check" CHECK (
    ("status" = 'PENDING' AND "snapshot" IS NULL AND "snapshotHash" IS NULL AND "snapshotByteLength" IS NULL AND "snapshotCapturedAt" IS NULL AND "publishedAt" IS NULL)
    OR
    ("status" = 'SNAPSHOT_READY' AND "snapshot" IS NOT NULL AND "snapshotHash" IS NOT NULL AND "snapshotByteLength" IS NOT NULL AND "snapshotCapturedAt" IS NOT NULL AND "publishedAt" IS NULL)
    OR
    ("status" = 'PUBLISHED' AND "snapshot" IS NOT NULL AND "snapshotHash" IS NOT NULL AND "snapshotByteLength" IS NOT NULL AND "snapshotCapturedAt" IS NOT NULL AND "publishedAt" IS NOT NULL)
    OR
    ("status" IN ('FAILED', 'CANCELLED') AND "publishedAt" IS NULL)
  )
);

CREATE TABLE "ExecutiveBrief" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "generationWorkspaceId" TEXT NOT NULL,
  "period" "ExecutiveBriefPeriod" NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "snapshotAsOf" TIMESTAMP(3) NOT NULL,
  "headline" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "highlights" JSONB NOT NULL DEFAULT '[]',
  "risks" JSONB NOT NULL DEFAULT '[]',
  "opportunities" JSONB NOT NULL DEFAULT '[]',
  "snapshotHash" TEXT NOT NULL,
  "sourceRunId" TEXT NOT NULL,
  "sourceAgentId" TEXT NOT NULL,
  "sourceAgentName" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutiveBrief_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExecutiveBrief_generation_workspace_check" CHECK ("generationWorkspaceId" = "workspaceId"),
  CONSTRAINT "ExecutiveBrief_window_check" CHECK ("windowEnd" > "windowStart"),
  CONSTRAINT "ExecutiveBrief_headline_length_check" CHECK (char_length("headline") BETWEEN 1 AND 200),
  CONSTRAINT "ExecutiveBrief_summary_length_check" CHECK (char_length("summary") BETWEEN 1 AND 4000)
);

CREATE TABLE "Decision" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "briefId" TEXT,
  "briefWorkspaceId" TEXT,
  "origin" "DecisionOrigin" NOT NULL DEFAULT 'MANUAL',
  "title" TEXT NOT NULL,
  "context" TEXT,
  "recommendation" TEXT,
  "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
  "priority" "DecisionPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueAt" TIMESTAMP(3),
  "status" "DecisionStatus" NOT NULL DEFAULT 'OPEN',
  "deferredUntil" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "actionType" "DecisionActionType",
  "actionPayload" JSONB,
  "actionRevision" INTEGER NOT NULL DEFAULT 0,
  "executionStatus" "DecisionExecutionStatus" NOT NULL DEFAULT 'NONE',
  "executionAttempts" INTEGER NOT NULL DEFAULT 0,
  "executionLeaseToken" TEXT,
  "executionLeaseExpiresAt" TIMESTAMP(3),
  "lastExecutionErrorCode" TEXT,
  "lastExecutionError" TEXT,
  "executedAt" TIMESTAMP(3),
  "resultType" TEXT,
  "resultId" TEXT,
  "resultLabel" TEXT,
  "resultHref" TEXT,
  "createdByType" "DecisionActorKind" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "resolvedByOperatorId" TEXT,
  "resolvedByOperatorName" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Decision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Decision_brief_pair_check" CHECK (
    ("briefId" IS NULL AND "briefWorkspaceId" IS NULL)
    OR
    ("briefId" IS NOT NULL AND "briefWorkspaceId" = "workspaceId")
  ),
  CONSTRAINT "Decision_title_length_check" CHECK (char_length("title") BETWEEN 1 AND 200),
  CONSTRAINT "Decision_context_length_check" CHECK ("context" IS NULL OR char_length("context") <= 4000),
  CONSTRAINT "Decision_recommendation_length_check" CHECK ("recommendation" IS NULL OR char_length("recommendation") <= 2000),
  CONSTRAINT "Decision_action_pair_check" CHECK (
    ("actionType" IS NULL AND "actionPayload" IS NULL AND "actionRevision" = 0)
    OR
    ("actionType" IS NOT NULL AND "actionPayload" IS NOT NULL AND "actionRevision" > 0)
  ),
  CONSTRAINT "Decision_deferred_check" CHECK (
    ("status" = 'DEFERRED' AND "deferredUntil" IS NOT NULL)
    OR
    ("status" <> 'DEFERRED' AND "deferredUntil" IS NULL)
  ),
  CONSTRAINT "Decision_resolver_check" CHECK (
    ("status" IN ('APPROVED', 'REJECTED') AND "resolvedByOperatorId" IS NOT NULL AND "resolvedByOperatorName" IS NOT NULL AND "resolvedAt" IS NOT NULL)
    OR
    ("status" IN ('OPEN', 'DEFERRED') AND "resolvedByOperatorId" IS NULL AND "resolvedByOperatorName" IS NULL AND "resolvedAt" IS NULL)
  ),
  CONSTRAINT "Decision_execution_shape_check" CHECK (
    ("executionStatus" IN ('NONE', 'NEEDS_REBIND'))
    OR
    ("status" = 'APPROVED' AND "actionType" IS NOT NULL AND "actionPayload" IS NOT NULL)
  ),
  CONSTRAINT "Decision_lease_check" CHECK (
    ("executionStatus" = 'RUNNING' AND "executionLeaseToken" IS NOT NULL AND "executionLeaseExpiresAt" IS NOT NULL)
    OR
    ("executionStatus" <> 'RUNNING' AND "executionLeaseToken" IS NULL AND "executionLeaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "Decision_success_check" CHECK (
    ("executionStatus" = 'SUCCEEDED' AND "executedAt" IS NOT NULL AND "resultType" IS NOT NULL AND "resultId" IS NOT NULL AND "resultLabel" IS NOT NULL)
    OR
    ("executionStatus" <> 'SUCCEEDED' AND "executedAt" IS NULL)
  ),
  CONSTRAINT "Decision_failure_check" CHECK (
    ("executionStatus" = 'FAILED' AND "lastExecutionError" IS NOT NULL)
    OR
    ("executionStatus" <> 'FAILED')
  )
);

CREATE TABLE "DecisionActionReceipt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "decisionWorkspaceId" TEXT NOT NULL,
  "actionRevision" INTEGER NOT NULL,
  "actionType" "DecisionActionType" NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "historicalTargetId" TEXT NOT NULL,
  "historicalTargetType" TEXT NOT NULL,
  "historicalTargetLabel" TEXT NOT NULL,
  "historicalTargetHref" TEXT,
  "liveTargetId" TEXT,
  "liveTargetHref" TEXT,
  "targetAvailability" "DecisionTargetAvailability" NOT NULL DEFAULT 'AVAILABLE',
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionActionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DecisionActionReceipt_workspace_check" CHECK ("decisionWorkspaceId" = "workspaceId"),
  CONSTRAINT "DecisionActionReceipt_revision_check" CHECK ("actionRevision" > 0),
  CONSTRAINT "DecisionActionReceipt_availability_check" CHECK (
    ("targetAvailability" = 'AVAILABLE' AND "liveTargetId" IS NOT NULL)
    OR
    ("targetAvailability" = 'UNAVAILABLE' AND "liveTargetId" IS NULL AND "liveTargetHref" IS NULL)
  )
);

CREATE TABLE "DecisionEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "decisionWorkspaceId" TEXT NOT NULL,
  "receiptId" TEXT,
  "receiptWorkspaceId" TEXT,
  "sequence" INTEGER NOT NULL,
  "type" "DecisionEventType" NOT NULL,
  "actorKind" "DecisionActorKind" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "fromStatus" "DecisionStatus",
  "toStatus" "DecisionStatus",
  "fromExecutionStatus" "DecisionExecutionStatus",
  "toExecutionStatus" "DecisionExecutionStatus",
  "actionRevision" INTEGER NOT NULL,
  "payloadHash" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "targetLabel" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DecisionEvent_decision_workspace_check" CHECK ("decisionWorkspaceId" = "workspaceId"),
  CONSTRAINT "DecisionEvent_receipt_pair_check" CHECK (
    ("receiptId" IS NULL AND "receiptWorkspaceId" IS NULL)
    OR
    ("receiptId" IS NOT NULL AND "receiptWorkspaceId" = "workspaceId")
  ),
  CONSTRAINT "DecisionEvent_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "DecisionEvent_revision_check" CHECK ("actionRevision" >= 0)
);

CREATE UNIQUE INDEX "ExecutiveBriefGeneration_id_workspaceId_key" ON "ExecutiveBriefGeneration"("id", "workspaceId");
CREATE UNIQUE INDEX "ExecutiveBriefGeneration_sourceAgentRunId_sourceAgentRunWorkspaceId_key" ON "ExecutiveBriefGeneration"("sourceAgentRunId", "sourceAgentRunWorkspaceId");
CREATE UNIQUE INDEX "ExecutiveBriefGeneration_active_period_key"
  ON "ExecutiveBriefGeneration"("workspaceId", "period")
  WHERE "status" IN ('PENDING', 'SNAPSHOT_READY');
CREATE INDEX "ExecutiveBriefGeneration_workspaceId_period_status_createdAt_id_idx" ON "ExecutiveBriefGeneration"("workspaceId", "period", "status", "createdAt", "id");
CREATE INDEX "ExecutiveBriefGeneration_workspaceId_createdAt_id_idx" ON "ExecutiveBriefGeneration"("workspaceId", "createdAt", "id");

CREATE UNIQUE INDEX "ExecutiveBrief_id_workspaceId_key" ON "ExecutiveBrief"("id", "workspaceId");
CREATE UNIQUE INDEX "ExecutiveBrief_generationId_generationWorkspaceId_key" ON "ExecutiveBrief"("generationId", "generationWorkspaceId");
CREATE INDEX "ExecutiveBrief_workspaceId_publishedAt_id_idx" ON "ExecutiveBrief"("workspaceId", "publishedAt", "id");

CREATE UNIQUE INDEX "Decision_id_workspaceId_key" ON "Decision"("id", "workspaceId");
CREATE INDEX "Decision_workspaceId_status_priority_dueAt_id_idx" ON "Decision"("workspaceId", "status", "priority", "dueAt", "id");
CREATE INDEX "Decision_workspaceId_deferredUntil_id_idx" ON "Decision"("workspaceId", "deferredUntil", "id");
CREATE INDEX "Decision_workspaceId_briefId_id_idx" ON "Decision"("workspaceId", "briefId", "id");
CREATE INDEX "Decision_executionStatus_executionLeaseExpiresAt_id_idx" ON "Decision"("executionStatus", "executionLeaseExpiresAt", "id");

CREATE UNIQUE INDEX "DecisionActionReceipt_id_workspaceId_key" ON "DecisionActionReceipt"("id", "workspaceId");
CREATE UNIQUE INDEX "DecisionActionReceipt_decisionId_actionRevision_key" ON "DecisionActionReceipt"("decisionId", "actionRevision");
CREATE INDEX "DecisionActionReceipt_workspaceId_decisionId_actionRevision_idx" ON "DecisionActionReceipt"("workspaceId", "decisionId", "actionRevision");

CREATE UNIQUE INDEX "DecisionEvent_decisionId_sequence_key" ON "DecisionEvent"("decisionId", "sequence");
CREATE INDEX "DecisionEvent_workspaceId_decisionId_sequence_idx" ON "DecisionEvent"("workspaceId", "decisionId", "sequence");
CREATE INDEX "DecisionEvent_workspaceId_createdAt_id_idx" ON "DecisionEvent"("workspaceId", "createdAt", "id");

ALTER TABLE "ExecutiveBriefGeneration" ADD CONSTRAINT "ExecutiveBriefGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutiveBriefGeneration" ADD CONSTRAINT "ExecutiveBriefGeneration_sourceAgentRunId_sourceAgentRunWorkspaceId_fkey" FOREIGN KEY ("sourceAgentRunId", "sourceAgentRunWorkspaceId") REFERENCES "AgentRun"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExecutiveBrief" ADD CONSTRAINT "ExecutiveBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutiveBrief" ADD CONSTRAINT "ExecutiveBrief_generationId_generationWorkspaceId_fkey" FOREIGN KEY ("generationId", "generationWorkspaceId") REFERENCES "ExecutiveBriefGeneration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_briefId_briefWorkspaceId_fkey" FOREIGN KEY ("briefId", "briefWorkspaceId") REFERENCES "ExecutiveBrief"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionActionReceipt" ADD CONSTRAINT "DecisionActionReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionActionReceipt" ADD CONSTRAINT "DecisionActionReceipt_decisionId_decisionWorkspaceId_fkey" FOREIGN KEY ("decisionId", "decisionWorkspaceId") REFERENCES "Decision"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_decisionId_decisionWorkspaceId_fkey" FOREIGN KEY ("decisionId", "decisionWorkspaceId") REFERENCES "Decision"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_receiptId_receiptWorkspaceId_fkey" FOREIGN KEY ("receiptId", "receiptWorkspaceId") REFERENCES "DecisionActionReceipt"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;
