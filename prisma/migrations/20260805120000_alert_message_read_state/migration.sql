-- Read state for alerts and messages.
--
-- Mail already tracked this (MailItem.isRead); alerts and messages did not, so
-- the topbar had no way to say "3 new". Both flags are workspace-wide, exactly
-- like MailItem.isRead: opening the section clears them for everyone in the
-- workspace rather than per operator.

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;

-- Everything that predates this migration counts as already seen. Without
-- this, the first page load after deploying would show the entire alert and
-- message history as unread.
UPDATE "Alert" SET "isRead" = true;
UPDATE "Message" SET "isRead" = true;

-- CreateIndex
CREATE INDEX "Alert_workspaceId_isRead_idx" ON "Alert"("workspaceId", "isRead");

-- CreateIndex
CREATE INDEX "Message_workspaceId_isRead_idx" ON "Message"("workspaceId", "isRead");

-- CreateIndex
CREATE INDEX "Message_workspaceId_channelId_isRead_idx" ON "Message"("workspaceId", "channelId", "isRead");
