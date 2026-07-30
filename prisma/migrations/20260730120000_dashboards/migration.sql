-- Dashboards: workspace-scoped widget boards plus the widgets placed on them.
-- Additive only — no existing table is touched. Follows the project's composite
-- foreign key convention ([id, workspaceId]) so a widget can never point at a
-- dashboard from another workspace, and the workspace-consistency CHECK mirrors
-- 20260727130000_service_labels.
--
-- The partial unique index on ("workspaceId") WHERE "isDefault" enforces "at
-- most one start dashboard per workspace" in the database, the same technique
-- 20260718130000_mail_client_multi_account uses for one WEBHOOK MailAccount per
-- workspace. It is not expressible in the Prisma DSL, hence the raw statement.

-- CreateEnum
CREATE TYPE "DashboardWidgetKind" AS ENUM ('CLOCK', 'WEATHER', 'CALENDAR', 'NOTE', 'BOOKMARKS', 'SERVICE_STATUS', 'SERVER_METRICS', 'MAIL', 'ALERTS', 'LOGS');

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "dashboardWorkspaceId" TEXT NOT NULL,
    "kind" "DashboardWidgetKind" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DashboardWidget_workspace_consistency_check"
      CHECK ("workspaceId" = "dashboardWorkspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_id_workspaceId_key" ON "Dashboard"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Dashboard_workspaceId_position_id_idx" ON "Dashboard"("workspaceId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_workspaceId_default_key" ON "Dashboard"("workspaceId") WHERE "isDefault";

-- CreateIndex
CREATE UNIQUE INDEX "DashboardWidget_id_workspaceId_key" ON "DashboardWidget"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "DashboardWidget_workspaceId_dashboardId_y_x_id_idx" ON "DashboardWidget"("workspaceId", "dashboardId", "y", "x", "id");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_dashboardWorkspaceId_fkey" FOREIGN KEY ("dashboardId", "dashboardWorkspaceId") REFERENCES "Dashboard"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
