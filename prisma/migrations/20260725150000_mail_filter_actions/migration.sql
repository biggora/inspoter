-- Durable transport actions for mail filters. Label assignment remains
-- transactional; IMAP read/move mutations are queued and retried separately.

CREATE TYPE "MailFilterActionJobType" AS ENUM (
  'SET_READ',
  'MOVE_TO_FOLDER'
);

CREATE TYPE "MailFilterActionJobStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

ALTER TABLE "MailFilterRule"
  ADD COLUMN "setRead" BOOLEAN,
  ADD COLUMN "moveToFolderId" TEXT,
  ADD COLUMN "moveToFolderWorkspaceId" TEXT;

ALTER TABLE "MailFilterRule"
  ADD CONSTRAINT "MailFilterRule_moveToFolder_workspace_check"
  CHECK (
    ("moveToFolderId" IS NULL AND "moveToFolderWorkspaceId" IS NULL)
    OR (
      "moveToFolderId" IS NOT NULL
      AND "moveToFolderWorkspaceId" = "workspaceId"
    )
  );

ALTER TABLE "MailFilterRule"
  ADD CONSTRAINT "MailFilterRule_moveToFolderId_moveToFolderWorkspaceId_fkey"
  FOREIGN KEY ("moveToFolderId", "moveToFolderWorkspaceId")
  REFERENCES "MailFolder"("id", "workspaceId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailFilterRun"
  ADD COLUMN "snapshotSetRead" BOOLEAN,
  ADD COLUMN "snapshotMoveToFolderId" TEXT;

CREATE TABLE "MailFilterActionJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "accountWorkspaceId" TEXT NOT NULL,
  "mailItemId" TEXT NOT NULL,
  "mailItemWorkspaceId" TEXT NOT NULL,
  "sourceRuleId" TEXT NOT NULL,
  "sourceRunId" TEXT,
  "type" "MailFilterActionJobType" NOT NULL,
  "readValue" BOOLEAN,
  "targetFolderId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "MailFilterActionJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailFilterActionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MailFilterActionJob_workspace_consistency_check"
    CHECK (
      "accountWorkspaceId" = "workspaceId"
      AND "mailItemWorkspaceId" = "workspaceId"
    ),
  CONSTRAINT "MailFilterActionJob_payload_check"
    CHECK (
      (
        "type" = 'SET_READ'
        AND "readValue" IS NOT NULL
        AND "targetFolderId" IS NULL
      )
      OR (
        "type" = 'MOVE_TO_FOLDER'
        AND "readValue" IS NULL
        AND "targetFolderId" IS NOT NULL
      )
    ),
  CONSTRAINT "MailFilterActionJob_attempts_check"
    CHECK (
      "attempts" >= 0
      AND "maxAttempts" > 0
      AND "attempts" <= "maxAttempts"
    ),
  CONSTRAINT "MailFilterActionJob_lease_check"
    CHECK (
      (
        "status" = 'RUNNING'
        AND "leaseToken" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
      )
      OR (
        "status" <> 'RUNNING'
        AND "leaseToken" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "MailFilterActionJob_id_workspaceId_key"
  ON "MailFilterActionJob"("id", "workspaceId");
CREATE UNIQUE INDEX "MailFilterActionJob_idempotencyKey_key"
  ON "MailFilterActionJob"("idempotencyKey");
CREATE INDEX "MailFilterActionJob_status_nextAttemptAt_createdAt_id_idx"
  ON "MailFilterActionJob"("status", "nextAttemptAt", "createdAt", "id");
CREATE INDEX "MailFilterActionJob_accountId_status_createdAt_id_idx"
  ON "MailFilterActionJob"("accountId", "status", "createdAt", "id");
CREATE INDEX "MailFilterActionJob_workspaceId_mailItemId_createdAt_id_idx"
  ON "MailFilterActionJob"("workspaceId", "mailItemId", "createdAt", "id");

ALTER TABLE "MailFilterActionJob"
  ADD CONSTRAINT "MailFilterActionJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailFilterActionJob"
  ADD CONSTRAINT "MailFilterActionJob_accountId_accountWorkspaceId_fkey"
  FOREIGN KEY ("accountId", "accountWorkspaceId")
  REFERENCES "MailAccount"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailFilterActionJob"
  ADD CONSTRAINT "MailFilterActionJob_mailItemId_mailItemWorkspaceId_fkey"
  FOREIGN KEY ("mailItemId", "mailItemWorkspaceId")
  REFERENCES "MailItem"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
