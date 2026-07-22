-- Q-15 Mail labels/filter rules, Phase 2 exact-sender tracer.
-- Additive only: existing Mail rows and columns are unchanged.

-- CreateEnum
CREATE TYPE "MailLabelColor" AS ENUM ('SLATE', 'RED', 'AMBER', 'GREEN', 'BLUE', 'VIOLET');

-- AlterTable: compound workspace-safe relation target for MailItemLabel.
CREATE UNIQUE INDEX "MailItem_id_workspaceId_key" ON "MailItem"("id", "workspaceId");

-- CreateTable
CREATE TABLE "MailLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" "MailLabelColor" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailItemLabel" (
    "workspaceId" TEXT NOT NULL,
    "mailItemId" TEXT NOT NULL,
    "mailItemWorkspaceId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailItemLabel_workspace_consistency_check"
      CHECK (
        "workspaceId" = "mailItemWorkspaceId"
        AND "workspaceId" = "labelWorkspaceId"
      )
);

-- CreateTable
CREATE TABLE "MailFilterRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountWorkspaceId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelWorkspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailFilterRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MailFilterRule_workspace_consistency_check"
      CHECK (
        "workspaceId" = "accountWorkspaceId"
        AND "workspaceId" = "labelWorkspaceId"
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "MailLabel_id_workspaceId_key" ON "MailLabel"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailLabel_workspaceId_normalizedName_key" ON "MailLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "MailLabel_workspaceId_position_id_idx" ON "MailLabel"("workspaceId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MailItemLabel_mailItemId_labelId_key" ON "MailItemLabel"("mailItemId", "labelId");

-- CreateIndex
CREATE INDEX "MailItemLabel_workspaceId_labelId_mailItemId_idx" ON "MailItemLabel"("workspaceId", "labelId", "mailItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MailFilterRule_id_workspaceId_key" ON "MailFilterRule"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "MailFilterRule_workspaceId_accountId_isActive_position_id_idx" ON "MailFilterRule"("workspaceId", "accountId", "isActive", "position", "id");

-- AddForeignKey
ALTER TABLE "MailLabel" ADD CONSTRAINT "MailLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailItemLabel" ADD CONSTRAINT "MailItemLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailItemLabel" ADD CONSTRAINT "MailItemLabel_mailItemId_mailItemWorkspaceId_fkey" FOREIGN KEY ("mailItemId", "mailItemWorkspaceId") REFERENCES "MailItem"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailItemLabel" ADD CONSTRAINT "MailItemLabel_labelId_labelWorkspaceId_fkey" FOREIGN KEY ("labelId", "labelWorkspaceId") REFERENCES "MailLabel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailFilterRule" ADD CONSTRAINT "MailFilterRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailFilterRule" ADD CONSTRAINT "MailFilterRule_accountId_accountWorkspaceId_fkey" FOREIGN KEY ("accountId", "accountWorkspaceId") REFERENCES "MailAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailFilterRule" ADD CONSTRAINT "MailFilterRule_labelId_labelWorkspaceId_fkey" FOREIGN KEY ("labelId", "labelWorkspaceId") REFERENCES "MailLabel"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
