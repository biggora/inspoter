ALTER TABLE "MailItem"
ADD COLUMN "draftReplyToId" TEXT,
ADD COLUMN "draftForwardOfId" TEXT;

CREATE INDEX "MailItem_workspaceId_accountId_draftReplyToId_idx"
ON "MailItem"("workspaceId", "accountId", "draftReplyToId");

CREATE INDEX "MailItem_workspaceId_accountId_draftForwardOfId_idx"
ON "MailItem"("workspaceId", "accountId", "draftForwardOfId");
