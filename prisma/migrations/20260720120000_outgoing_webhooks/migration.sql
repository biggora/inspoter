-- Outgoing webhooks: operator-configured subscriptions + durable delivery queue.
CREATE TYPE "OutgoingWebhookEvent" AS ENUM (
  'ALERT_CREATED', 'SERVICE_STATUS', 'MESSAGE_CREATED', 'LOG_CREATED', 'MAIL_RECEIVED');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
  'PENDING', 'DELIVERING', 'DELIVERED', 'FAILED');

CREATE TABLE "OutgoingWebhook" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "events" "OutgoingWebhookEvent"[] NOT NULL DEFAULT ARRAY[]::"OutgoingWebhookEvent"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "encryptedData" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "secretPrefix" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutgoingWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutgoingWebhook_id_workspaceId_key"
  ON "OutgoingWebhook"("id", "workspaceId");
CREATE INDEX "OutgoingWebhook_workspaceId_createdAt_id_idx"
  ON "OutgoingWebhook"("workspaceId", "createdAt", "id");
CREATE INDEX "OutgoingWebhook_workspaceId_isActive_idx"
  ON "OutgoingWebhook"("workspaceId", "isActive");

ALTER TABLE "OutgoingWebhook"
  ADD CONSTRAINT "OutgoingWebhook_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "webhookWorkspaceId" TEXT NOT NULL,
  "event" "OutgoingWebhookEvent" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lastStatusCode" INTEGER,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_workspaceId_webhookId_createdAt_id_idx"
  ON "WebhookDelivery"("workspaceId", "webhookId", "createdAt", "id");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
  ON "WebhookDelivery"("status", "nextAttemptAt");

ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WebhookDelivery_webhook_fkey"
    FOREIGN KEY ("webhookId", "webhookWorkspaceId") REFERENCES "OutgoingWebhook"("id", "workspaceId")
    ON DELETE CASCADE ON UPDATE CASCADE;
