-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "defaultWorkspaceId" TEXT;

-- AlterTable
ALTER TABLE "OutgoingWebhook" ALTER COLUMN "events" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "LocalServer" RENAME CONSTRAINT "LocalServer_providerCredentialId_providerCredentialWorkspaceId_" TO "LocalServer_providerCredentialId_providerCredentialWorkspa_fkey";

-- RenameForeignKey
ALTER TABLE "WebhookDelivery" RENAME CONSTRAINT "WebhookDelivery_webhook_fkey" TO "WebhookDelivery_webhookId_webhookWorkspaceId_fkey";

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_defaultWorkspaceId_fkey" FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LocalServer_workspaceId_providerCredentialId_providerRemoteId_k" RENAME TO "LocalServer_workspaceId_providerCredentialId_providerRemote_key";
