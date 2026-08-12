-- Kanban: workspace-scoped task boards, their ordered status columns, the
-- cards on them, plus card labels, checklist items and comments. Additive
-- only — no existing table is touched.
--
-- Follows the project's composite foreign key convention ([id, workspaceId])
-- so a column can never point at a board from another workspace, with the
-- workspace-consistency CHECKs mirroring 20260727130000_service_labels.
--
-- KanbanCard.assignee targets WorkspaceMember("workspaceId", "operatorId")
-- rather than Operator: removing someone from the workspace has to unassign
-- their cards, and ON DELETE SET NULL against the membership row does that
-- without an application-side sweep.
--
-- The three enum extensions below only declare new values; no row in this
-- migration uses them, which is what PostgreSQL requires when ALTER TYPE ...
-- ADD VALUE runs inside the migration transaction. Same technique as
-- 20260802120000_llm_provider.

-- AlterEnum
ALTER TYPE "DashboardWidgetKind" ADD VALUE 'KANBAN';

-- AlterEnum
ALTER TYPE "OutgoingWebhookEvent" ADD VALUE 'KANBAN_CARD_CREATED';
ALTER TYPE "OutgoingWebhookEvent" ADD VALUE 'KANBAN_CARD_MOVED';
ALTER TYPE "OutgoingWebhookEvent" ADD VALUE 'KANBAN_CARD_COMPLETED';

-- CreateEnum
CREATE TYPE "KanbanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "KanbanLinkType" AS ENUM ('SERVER', 'DOMAIN', 'SERVICE', 'ALERT', 'HOSTING_ACCOUNT');

-- CreateTable
CREATE TABLE "KanbanBoard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanColumn" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "boardWorkspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "wipLimit" INTEGER,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KanbanColumn_workspace_consistency_check"
      CHECK ("workspaceId" = "boardWorkspaceId")
);

-- CreateTable
CREATE TABLE "KanbanCard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "boardWorkspaceId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "columnWorkspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "priority" "KanbanPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assigneeOperatorId" TEXT,
    "assigneeWorkspaceId" TEXT,
    "linkedType" "KanbanLinkType",
    "linkedId" TEXT,
    "linkedLabel" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KanbanCard_workspace_consistency_check"
      CHECK (
        "workspaceId" = "boardWorkspaceId"
        AND "workspaceId" = "columnWorkspaceId"
        AND ("assigneeWorkspaceId" IS NULL OR "workspaceId" = "assigneeWorkspaceId")
      ),
    -- Both assignee columns move together: the composite foreign key is only
    -- meaningful when neither half is null, and SET NULL clears both.
    CONSTRAINT "KanbanCard_assignee_pair_check"
      CHECK (("assigneeWorkspaceId" IS NULL) = ("assigneeOperatorId" IS NULL)),
    -- Same pairing rule for the soft entity link.
    CONSTRAINT "KanbanCard_link_pair_check"
      CHECK (("linkedType" IS NULL) = ("linkedId" IS NULL))
);

-- CreateTable
CREATE TABLE "KanbanLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanCardLabel" (
    "workspaceId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardWorkspaceId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanCardLabel_workspace_consistency_check"
      CHECK (
        "workspaceId" = "cardWorkspaceId"
        AND "workspaceId" = "labelWorkspaceId"
      )
);

-- CreateTable
CREATE TABLE "KanbanChecklistItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardWorkspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanChecklistItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KanbanChecklistItem_workspace_consistency_check"
      CHECK ("workspaceId" = "cardWorkspaceId")
);

-- CreateTable
CREATE TABLE "KanbanComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardWorkspaceId" TEXT NOT NULL,
    "authorOperatorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KanbanComment_workspace_consistency_check"
      CHECK ("workspaceId" = "cardWorkspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KanbanBoard_id_workspaceId_key" ON "KanbanBoard"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "KanbanBoard_workspaceId_position_id_idx" ON "KanbanBoard"("workspaceId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanColumn_id_workspaceId_key" ON "KanbanColumn"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "KanbanColumn_workspaceId_boardId_position_id_idx" ON "KanbanColumn"("workspaceId", "boardId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCard_id_workspaceId_key" ON "KanbanCard"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "KanbanCard_workspaceId_boardId_columnId_position_id_idx" ON "KanbanCard"("workspaceId", "boardId", "columnId", "position", "id");

-- CreateIndex
CREATE INDEX "KanbanCard_workspaceId_dueDate_idx" ON "KanbanCard"("workspaceId", "dueDate");

-- CreateIndex
CREATE INDEX "KanbanCard_assigneeWorkspaceId_assigneeOperatorId_idx" ON "KanbanCard"("assigneeWorkspaceId", "assigneeOperatorId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanLabel_id_workspaceId_key" ON "KanbanLabel"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanLabel_workspaceId_normalizedName_key" ON "KanbanLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "KanbanLabel_workspaceId_normalizedName_idx" ON "KanbanLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanCardLabel_cardId_labelId_key" ON "KanbanCardLabel"("cardId", "labelId");

-- CreateIndex
CREATE INDEX "KanbanCardLabel_workspaceId_labelId_cardId_idx" ON "KanbanCardLabel"("workspaceId", "labelId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanChecklistItem_id_workspaceId_key" ON "KanbanChecklistItem"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "KanbanChecklistItem_workspaceId_cardId_position_id_idx" ON "KanbanChecklistItem"("workspaceId", "cardId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanComment_id_workspaceId_key" ON "KanbanComment"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "KanbanComment_workspaceId_cardId_createdAt_id_idx" ON "KanbanComment"("workspaceId", "cardId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_boardId_boardWorkspaceId_fkey" FOREIGN KEY ("boardId", "boardWorkspaceId") REFERENCES "KanbanBoard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_boardId_boardWorkspaceId_fkey" FOREIGN KEY ("boardId", "boardWorkspaceId") REFERENCES "KanbanBoard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_columnId_columnWorkspaceId_fkey" FOREIGN KEY ("columnId", "columnWorkspaceId") REFERENCES "KanbanColumn"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_assigneeWorkspaceId_assigneeOperatorId_fkey" FOREIGN KEY ("assigneeWorkspaceId", "assigneeOperatorId") REFERENCES "WorkspaceMember"("workspaceId", "operatorId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanLabel" ADD CONSTRAINT "KanbanLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT "KanbanCardLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT "KanbanCardLabel_cardId_cardWorkspaceId_fkey" FOREIGN KEY ("cardId", "cardWorkspaceId") REFERENCES "KanbanCard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT "KanbanCardLabel_labelId_labelWorkspaceId_fkey" FOREIGN KEY ("labelId", "labelWorkspaceId") REFERENCES "KanbanLabel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanChecklistItem" ADD CONSTRAINT "KanbanChecklistItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanChecklistItem" ADD CONSTRAINT "KanbanChecklistItem_cardId_cardWorkspaceId_fkey" FOREIGN KEY ("cardId", "cardWorkspaceId") REFERENCES "KanbanCard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanComment" ADD CONSTRAINT "KanbanComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanComment" ADD CONSTRAINT "KanbanComment_cardId_cardWorkspaceId_fkey" FOREIGN KEY ("cardId", "cardWorkspaceId") REFERENCES "KanbanCard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
