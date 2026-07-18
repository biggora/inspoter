-- Channel-scoped incoming webhooks and structured message attribution.
CREATE TYPE "MessageOrigin" AS ENUM ('LEGACY', 'OPERATOR', 'WEBHOOK');

ALTER TABLE "Message"
  ADD COLUMN "origin" "MessageOrigin" NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "WebhookToken"
  ADD COLUMN "channelId" TEXT,
  ADD COLUMN "channelWorkspaceId" TEXT;

ALTER TABLE "WebhookToken"
  ADD CONSTRAINT "WebhookToken_channel_pair_check"
    CHECK (
      ("channelId" IS NULL AND "channelWorkspaceId" IS NULL)
      OR
      ("channelId" IS NOT NULL AND "channelWorkspaceId" IS NOT NULL)
    ),
  ADD CONSTRAINT "WebhookToken_channel_workspace_check"
    CHECK (
      "channelWorkspaceId" IS NULL
      OR "channelWorkspaceId" = "workspaceId"
    ),
  ADD CONSTRAINT "WebhookToken_channelId_channelWorkspaceId_fkey"
    FOREIGN KEY ("channelId", "channelWorkspaceId")
    REFERENCES "Channel"("id", "workspaceId")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WebhookToken_workspaceId_channelId_createdAt_id_idx"
  ON "WebhookToken"("workspaceId", "channelId", "createdAt", "id");
