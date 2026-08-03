-- Dashboard widget for the Messages section: a tile showing the latest messages
-- of a whole category or of hand-picked channels. The new enum value is not
-- used in this migration, so the PostgreSQL restriction on using a freshly
-- added enum value inside the same transaction does not apply.
ALTER TYPE "DashboardWidgetKind" ADD VALUE 'MESSAGES';

-- The widget reads the latest messages across every channel of a workspace,
-- which the existing ("workspaceId", "channelId", "createdAt", "id") index
-- cannot serve: its second column is not constrained by that query.
CREATE INDEX "Message_workspaceId_createdAt_id_idx" ON "Message"("workspaceId", "createdAt", "id");
