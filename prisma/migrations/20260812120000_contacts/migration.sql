-- Contacts: a workspace-scoped address book (Google-Contacts-style) plus its
-- labels. Additive only — no existing table is touched.
--
-- Follows the project's composite foreign key convention ([id, workspaceId])
-- so a field, address or label assignment can never point at a contact from
-- another workspace, with the workspace-consistency CHECK mirroring
-- 20260730120000_dashboards.

-- CreateEnum
CREATE TYPE "ContactFieldKind" AS ENUM ('EMAIL', 'PHONE', 'URL', 'IM', 'EVENT', 'RELATION', 'CUSTOM');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prefix" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "suffix" TEXT,
    "phoneticFirst" TEXT,
    "phoneticMiddle" TEXT,
    "phoneticLast" TEXT,
    "nickname" TEXT,
    "fileAs" TEXT,
    "displayName" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "organization" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "birthday" TEXT,
    "notes" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "photo" BYTEA,
    "photoContentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactField" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactWorkspaceId" TEXT NOT NULL,
    "kind" "ContactFieldKind" NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactField_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContactField_workspace_consistency_check"
      CHECK ("workspaceId" = "contactWorkspaceId")
);

-- CreateTable
CREATE TABLE "ContactAddress" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactWorkspaceId" TEXT NOT NULL,
    "label" TEXT,
    "poBox" TEXT,
    "extended" TEXT,
    "street" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "formatted" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactAddress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContactAddress_workspace_consistency_check"
      CHECK ("workspaceId" = "contactWorkspaceId")
);

-- CreateTable
CREATE TABLE "ContactLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactLabelAssignment" (
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactWorkspaceId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLabelAssignment_workspace_consistency_check"
      CHECK ("workspaceId" = "contactWorkspaceId" AND "workspaceId" = "labelWorkspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_workspaceId_key" ON "Contact"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_sortKey_id_idx" ON "Contact"("workspaceId", "sortKey", "id");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_starred_sortKey_id_idx" ON "Contact"("workspaceId", "starred", "sortKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContactField_id_workspaceId_key" ON "ContactField"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "ContactField_workspaceId_contactId_kind_position_idx" ON "ContactField"("workspaceId", "contactId", "kind", "position");

-- CreateIndex
CREATE INDEX "ContactField_workspaceId_kind_normalizedValue_idx" ON "ContactField"("workspaceId", "kind", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAddress_id_workspaceId_key" ON "ContactAddress"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "ContactAddress_workspaceId_contactId_position_idx" ON "ContactAddress"("workspaceId", "contactId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLabel_id_workspaceId_key" ON "ContactLabel"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLabel_workspaceId_normalizedName_key" ON "ContactLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "ContactLabel_workspaceId_position_id_idx" ON "ContactLabel"("workspaceId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLabelAssignment_contactId_labelId_key" ON "ContactLabelAssignment"("contactId", "labelId");

-- CreateIndex
CREATE INDEX "ContactLabelAssignment_workspaceId_labelId_contactId_idx" ON "ContactLabelAssignment"("workspaceId", "labelId", "contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactField" ADD CONSTRAINT "ContactField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactField" ADD CONSTRAINT "ContactField_contactId_contactWorkspaceId_fkey" FOREIGN KEY ("contactId", "contactWorkspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAddress" ADD CONSTRAINT "ContactAddress_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAddress" ADD CONSTRAINT "ContactAddress_contactId_contactWorkspaceId_fkey" FOREIGN KEY ("contactId", "contactWorkspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLabel" ADD CONSTRAINT "ContactLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLabelAssignment" ADD CONSTRAINT "ContactLabelAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLabelAssignment" ADD CONSTRAINT "ContactLabelAssignment_contactId_contactWorkspaceId_fkey" FOREIGN KEY ("contactId", "contactWorkspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLabelAssignment" ADD CONSTRAINT "ContactLabelAssignment_labelId_labelWorkspaceId_fkey" FOREIGN KEY ("labelId", "labelWorkspaceId") REFERENCES "ContactLabel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
