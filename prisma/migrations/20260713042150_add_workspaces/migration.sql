-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_operatorId_idx" ON "WorkspaceMember"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_operatorId_key" ON "WorkspaceMember"("workspaceId", "operatorId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: create a default workspace for each existing operator
INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."username" || '''s workspace',
  lower(regexp_replace(o."username", '[^a-zA-Z0-9]', '-', 'g')),
  now(),
  now()
FROM "Operator" o
WHERE NOT EXISTS (SELECT 1 FROM "Workspace" LIMIT 1);

-- Backfill: create owner membership for each operator→workspace pair
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "operatorId", "role", "joinedAt")
SELECT
  gen_random_uuid()::text,
  w."id",
  o."id",
  'owner',
  now()
FROM "Operator" o
CROSS JOIN "Workspace" w
WHERE NOT EXISTS (SELECT 1 FROM "WorkspaceMember" LIMIT 1);

-- Add workspaceId columns as NULLABLE first
ALTER TABLE "Category" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "MessageCategory" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "MailItem" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "LogEntry" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AlertCategory" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "WebhookToken" ADD COLUMN "workspaceId" TEXT;

-- Backfill: assign all existing rows to the default workspace
UPDATE "Category" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;
UPDATE "MessageCategory" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;
UPDATE "MailItem" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;
UPDATE "LogEntry" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;
UPDATE "AlertCategory" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;
UPDATE "WebhookToken" SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1) WHERE "workspaceId" IS NULL;

-- Make workspaceId NOT NULL
ALTER TABLE "Category" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "MessageCategory" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "MailItem" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "LogEntry" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "AlertCategory" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "WebhookToken" ALTER COLUMN "workspaceId" SET NOT NULL;

-- Add activeWorkspaceId to Session
ALTER TABLE "Session" ADD COLUMN "activeWorkspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Category_workspaceId_idx" ON "Category"("workspaceId");
CREATE INDEX "MessageCategory_workspaceId_idx" ON "MessageCategory"("workspaceId");
CREATE INDEX "MailItem_workspaceId_idx" ON "MailItem"("workspaceId");
CREATE INDEX "LogEntry_workspaceId_idx" ON "LogEntry"("workspaceId");
CREATE INDEX "AlertCategory_workspaceId_idx" ON "AlertCategory"("workspaceId");
CREATE INDEX "WebhookToken_workspaceId_idx" ON "WebhookToken"("workspaceId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageCategory" ADD CONSTRAINT "MessageCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailItem" ADD CONSTRAINT "MailItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertCategory" ADD CONSTRAINT "AlertCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookToken" ADD CONSTRAINT "WebhookToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
