-- AI Assistant: workspace-scoped agents, reusable skills, their schedules, and
-- the durable run history the runtime writes. Additive only — no existing
-- table or enum is touched, so an existing deployment upgrades without a
-- backfill and without a window where a section is half-migrated.
--
-- Follows the project's composite foreign key convention ([id, workspaceId])
-- with workspace-consistency CHECKs, mirroring 20260824120000_notes: a column
-- can never point at a row from another workspace, and the CHECK proves it
-- without needing a trigger.
--
-- Four decisions worth stating, because a later reader will otherwise wonder:
--
-- (a) "AgentRun" IS the work queue. There is no separate job table. One
-- schedule occurrence is one leased unit of work with no fan-out, which is
-- exactly the shape of "MailFilterRun"; "MailFilterActionJob" exists only
-- because a filter run explodes into N per-message IMAP actions, and an agent
-- run's tool calls happen inside its own lease instead.
--
-- (b) "nextAttemptAt" carries DEFAULT CURRENT_TIMESTAMP only so a hand-written
-- INSERT is valid. Every code path stamps it from the scheduler's injected
-- runtime.now(). The claim query filters candidates against Node's clock, and
-- mixing the two clocks is what made a freshly enqueued job briefly invisible
-- in fc111d5 — the same trap is deliberately avoided here.
--
-- (c) The snapshot columns on "AgentRun" duplicate the agent's configuration
-- on purpose. A run has to stay explainable after its agent is edited or
-- deleted, and the live foreign keys are ON DELETE SET NULL for the same
-- reason: history survives, it just stops being clickable.
--
-- (d) "AgentSkill" has no primary key, matching "NoteTagLink": the pair
-- ("agentId", "skillId") is the identity, and a surrogate id would only add a
-- column nothing reads.

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRunTrigger" AS ENUM ('MANUAL', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "AgentRunStepKind" AS ENUM ('MODEL_CALL', 'TOOL_CALL');

-- CreateEnum
CREATE TYPE "AgentScheduleKind" AS ENUM ('INTERVAL', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    -- Subset of MCP_SCOPES (src/lib/mcp/scopes.ts), stored as plain strings
    -- like "WebhookToken"."scopes" so a value written by a newer deployment is
    -- dropped by parseScopes() rather than trusted.
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "maxSteps" INTEGER NOT NULL DEFAULT 8,
    "maxTokens" INTEGER NOT NULL DEFAULT 20000,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "reportOnCompletion" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id"),
    -- Cheap structural floor under the env ceilings enforced at run time; a
    -- row that cannot run at all should not be storable.
    CONSTRAINT "Agent_ceilings_check"
      CHECK ("maxSteps" > 0 AND "maxTokens" > 0 AND "timeoutSeconds" > 0)
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    -- Optional narrowing of the agent's toolset. Never a widening: a skill
    -- that could add a tool would make the agent's scope list a lie.
    "toolNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentWorkspaceId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillWorkspaceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSkill_workspace_consistency_check"
      CHECK (
        "workspaceId" = "agentWorkspaceId"
        AND "workspaceId" = "skillWorkspaceId"
      )
);

-- CreateTable
CREATE TABLE "AgentSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentWorkspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AgentScheduleKind" NOT NULL,
    "intervalSeconds" INTEGER,
    "minuteOfDay" INTEGER,
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "input" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentSchedule_workspace_consistency_check"
      CHECK ("workspaceId" = "agentWorkspaceId"),
    -- Each kind needs exactly the fields it reads. Expressed here rather than
    -- only in zod so a row written by a future code path cannot make
    -- computeNextRunAt() unanswerable.
    CONSTRAINT "AgentSchedule_kind_fields_check"
      CHECK (
        ("kind" = 'INTERVAL' AND "intervalSeconds" IS NOT NULL AND "minuteOfDay" IS NULL)
        OR ("kind" = 'DAILY' AND "minuteOfDay" IS NOT NULL AND "intervalSeconds" IS NULL)
        OR ("kind" = 'WEEKLY' AND "minuteOfDay" IS NOT NULL AND "intervalSeconds" IS NULL
            AND array_length("daysOfWeek", 1) IS NOT NULL)
      ),
    CONSTRAINT "AgentSchedule_ranges_check"
      CHECK (
        ("intervalSeconds" IS NULL OR "intervalSeconds" >= 300)
        AND ("minuteOfDay" IS NULL OR ("minuteOfDay" >= 0 AND "minuteOfDay" <= 1439))
      )
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "agentWorkspaceId" TEXT,
    "sourceAgentId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "scheduleWorkspaceId" TEXT,
    "sourceScheduleId" TEXT,
    "snapshotAgentName" TEXT NOT NULL,
    "snapshotInstructions" TEXT NOT NULL,
    "snapshotScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "snapshotSkills" JSONB NOT NULL DEFAULT '[]',
    "snapshotMaxSteps" INTEGER NOT NULL,
    "snapshotMaxTokens" INTEGER NOT NULL,
    "snapshotTimeoutSeconds" INTEGER NOT NULL,
    "input" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "AgentRunTrigger" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "stopReason" TEXT,
    "summary" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentRun_workspace_consistency_check"
      CHECK (
        ("agentWorkspaceId" IS NULL OR "workspaceId" = "agentWorkspaceId")
        AND ("scheduleWorkspaceId" IS NULL OR "workspaceId" = "scheduleWorkspaceId")
      ),
    CONSTRAINT "AgentRun_agent_pair_check"
      CHECK (("agentId" IS NULL) = ("agentWorkspaceId" IS NULL)),
    CONSTRAINT "AgentRun_schedule_pair_check"
      CHECK (("scheduleId" IS NULL) = ("scheduleWorkspaceId" IS NULL))
);

-- CreateTable
CREATE TABLE "AgentRunStep" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "runWorkspaceId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" "AgentRunStepKind" NOT NULL,
    "toolName" TEXT,
    "toolScope" TEXT,
    "argsJson" JSONB,
    "resultText" TEXT,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "modelText" TEXT,
    "stopReason" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentRunStep_workspace_consistency_check"
      CHECK ("workspaceId" = "runWorkspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_id_workspaceId_key" ON "Agent"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_workspaceId_normalizedName_key" ON "Agent"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "Agent_workspaceId_normalizedName_idx" ON "Agent"("workspaceId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_id_workspaceId_key" ON "Skill"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_workspaceId_normalizedName_key" ON "Skill"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "Skill_workspaceId_normalizedName_idx" ON "Skill"("workspaceId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_agentId_skillId_key" ON "AgentSkill"("agentId", "skillId");

-- CreateIndex
CREATE INDEX "AgentSkill_workspaceId_agentId_position_skillId_idx" ON "AgentSkill"("workspaceId", "agentId", "position", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSchedule_id_workspaceId_key" ON "AgentSchedule"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "AgentSchedule_workspaceId_agentId_nextRunAt_idx" ON "AgentSchedule"("workspaceId", "agentId", "nextRunAt");

-- CreateIndex
-- Scheduler due-query. Intentionally NOT workspace-prefixed: the sweep is
-- cross-tenant, exactly like "Service"."nextCheckAt".
CREATE INDEX "AgentSchedule_isActive_nextRunAt_idx" ON "AgentSchedule"("isActive", "nextRunAt");

-- CreateIndex
-- The idempotency key is what makes schedule materialisation safe: two ticks
-- racing on the same occurrence both build the same key, and exactly one
-- INSERT survives.
CREATE UNIQUE INDEX "AgentRun_idempotencyKey_key" ON "AgentRun"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_id_workspaceId_key" ON "AgentRun"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_sourceAgentId_createdAt_id_idx" ON "AgentRun"("workspaceId", "sourceAgentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_status_createdAt_id_idx" ON "AgentRun"("workspaceId", "status", "createdAt", "id");

-- CreateIndex
-- Cross-tenant sweeps, for the same reason as the schedule index above:
-- claiming due runs, reclaiming expired leases, and pruning old history.
CREATE INDEX "AgentRun_status_nextAttemptAt_createdAt_id_idx" ON "AgentRun"("status", "nextAttemptAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AgentRun_status_leaseExpiresAt_id_idx" ON "AgentRun"("status", "leaseExpiresAt", "id");

-- CreateIndex
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunStep_runId_index_key" ON "AgentRunStep"("runId", "index");

-- CreateIndex
CREATE INDEX "AgentRunStep_workspaceId_runId_index_idx" ON "AgentRunStep"("workspaceId", "runId", "index");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_agentId_agentWorkspaceId_fkey" FOREIGN KEY ("agentId", "agentWorkspaceId") REFERENCES "Agent"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_skillId_skillWorkspaceId_fkey" FOREIGN KEY ("skillId", "skillWorkspaceId") REFERENCES "Skill"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSchedule" ADD CONSTRAINT "AgentSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSchedule" ADD CONSTRAINT "AgentSchedule_agentId_agentWorkspaceId_fkey" FOREIGN KEY ("agentId", "agentWorkspaceId") REFERENCES "Agent"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, not CASCADE: deleting an agent must not erase the record of what
-- it did. The snapshot columns keep the row readable on its own.
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_agentWorkspaceId_fkey" FOREIGN KEY ("agentId", "agentWorkspaceId") REFERENCES "Agent"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_scheduleId_scheduleWorkspaceId_fkey" FOREIGN KEY ("scheduleId", "scheduleWorkspaceId") REFERENCES "AgentSchedule"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_runWorkspaceId_fkey" FOREIGN KEY ("runId", "runWorkspaceId") REFERENCES "AgentRun"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
