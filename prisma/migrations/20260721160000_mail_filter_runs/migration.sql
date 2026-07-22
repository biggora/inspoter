-- Q-15 Mail labels/filter rules, Phase 5 durable historical application.
-- Additive only: existing Mail messages, rules, and assignments are unchanged.

CREATE TYPE "MailFilterRunStatus" AS ENUM (
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
);

CREATE TABLE "MailFilterRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ruleId" TEXT,
  "ruleWorkspaceId" TEXT,
  "sourceRuleId" TEXT NOT NULL,
  "snapshotAccountId" TEXT NOT NULL,
  "snapshotLabelId" TEXT NOT NULL,
  "snapshotFromAddress" TEXT,
  "snapshotSubjectContains" TEXT,
  "status" "MailFilterRunStatus" NOT NULL DEFAULT 'PENDING',
  "cutoffCreatedAt" TIMESTAMP(3),
  "cutoffId" TEXT,
  "cursorCreatedAt" TIMESTAMP(3),
  "cursorId" TEXT,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailFilterRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MailFilterRun_rule_workspace_check" CHECK (
    ("ruleId" IS NULL AND "ruleWorkspaceId" IS NULL)
    OR
    (
      "ruleId" IS NOT NULL
      AND "ruleWorkspaceId" IS NOT NULL
      AND "ruleWorkspaceId" = "workspaceId"
    )
  ),
  CONSTRAINT "MailFilterRun_snapshot_predicate_check" CHECK (
    ("snapshotFromAddress" IS NOT NULL AND btrim("snapshotFromAddress") <> '')
    OR
    ("snapshotSubjectContains" IS NOT NULL AND btrim("snapshotSubjectContains") <> '')
  ),
  CONSTRAINT "MailFilterRun_cutoff_tuple_check" CHECK (
    ("cutoffCreatedAt" IS NULL) = ("cutoffId" IS NULL)
  ),
  CONSTRAINT "MailFilterRun_cursor_tuple_check" CHECK (
    ("cursorCreatedAt" IS NULL) = ("cursorId" IS NULL)
  ),
  CONSTRAINT "MailFilterRun_cursor_cutoff_order_check" CHECK (
    "cursorCreatedAt" IS NULL
    OR (
      "cutoffCreatedAt" IS NOT NULL
      AND ("cursorCreatedAt", "cursorId") <= ("cutoffCreatedAt", "cutoffId")
    )
  ),
  CONSTRAINT "MailFilterRun_counts_check" CHECK (
    "processedCount" >= 0
    AND "matchedCount" >= 0
    AND "matchedCount" <= "processedCount"
  ),
  CONSTRAINT "MailFilterRun_attempts_check" CHECK (
    "attempts" >= 0 AND "attempts" <= 3
  ),
  CONSTRAINT "MailFilterRun_lease_state_check" CHECK (
    ("status" = 'RUNNING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR
    ("status" <> 'RUNNING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "MailFilterRun_terminal_state_check" CHECK (
    ("status" IN ('COMPLETED', 'FAILED') AND "completedAt" IS NOT NULL)
    OR
    ("status" IN ('PENDING', 'RUNNING') AND "completedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "MailFilterRun_id_workspaceId_key"
  ON "MailFilterRun"("id", "workspaceId");

CREATE INDEX "MailFilterRun_workspaceId_sourceRuleId_createdAt_id_idx"
  ON "MailFilterRun"("workspaceId", "sourceRuleId", "createdAt", "id");

CREATE INDEX "MailFilterRun_status_leaseExpiresAt_id_idx"
  ON "MailFilterRun"("status", "leaseExpiresAt", "id");

CREATE UNIQUE INDEX "MailFilterRun_one_active_source_rule_key"
  ON "MailFilterRun"("sourceRuleId")
  WHERE "status" IN ('PENDING', 'RUNNING');

CREATE INDEX "MailItem_workspaceId_accountId_createdAt_id_idx"
  ON "MailItem"("workspaceId", "accountId", "createdAt", "id");

ALTER TABLE "MailFilterRun"
  ADD CONSTRAINT "MailFilterRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailFilterRun"
  ADD CONSTRAINT "MailFilterRun_ruleId_ruleWorkspaceId_fkey"
  FOREIGN KEY ("ruleId", "ruleWorkspaceId")
  REFERENCES "MailFilterRule"("id", "workspaceId")
  ON DELETE SET NULL ON UPDATE CASCADE;
