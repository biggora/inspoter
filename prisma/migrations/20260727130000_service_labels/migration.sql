-- Service labels: workspace-scoped label definitions plus their many-to-many
-- assignments to services. Additive only — existing Service rows and columns
-- are unchanged. Mirrors the MailLabel/MailItemLabel shape from
-- 20260720190000_mail_labels_exact_sender, minus the position column and the
-- restrictive filter-rule foreign key.

-- CreateTable
CREATE TABLE "ServiceLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLabelAssignment" (
    "workspaceId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceWorkspaceId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLabelAssignment_workspace_consistency_check"
      CHECK (
        "workspaceId" = "serviceWorkspaceId"
        AND "workspaceId" = "labelWorkspaceId"
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLabel_id_workspaceId_key" ON "ServiceLabel"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLabel_workspaceId_normalizedName_key" ON "ServiceLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "ServiceLabel_workspaceId_normalizedName_idx" ON "ServiceLabel"("workspaceId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLabelAssignment_serviceId_labelId_key" ON "ServiceLabelAssignment"("serviceId", "labelId");

-- CreateIndex
CREATE INDEX "ServiceLabelAssignment_workspaceId_labelId_serviceId_idx" ON "ServiceLabelAssignment"("workspaceId", "labelId", "serviceId");

-- AddForeignKey
ALTER TABLE "ServiceLabel" ADD CONSTRAINT "ServiceLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLabelAssignment" ADD CONSTRAINT "ServiceLabelAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLabelAssignment" ADD CONSTRAINT "ServiceLabelAssignment_serviceId_serviceWorkspaceId_fkey" FOREIGN KEY ("serviceId", "serviceWorkspaceId") REFERENCES "Service"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLabelAssignment" ADD CONSTRAINT "ServiceLabelAssignment_labelId_labelWorkspaceId_fkey" FOREIGN KEY ("labelId", "labelWorkspaceId") REFERENCES "ServiceLabel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
