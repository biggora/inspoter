-- DropIndex
DROP INDEX "ProviderCredential_workspaceId_provider_key";

-- CreateIndex
CREATE INDEX "ProviderCredential_workspaceId_provider_idx" ON "ProviderCredential"("workspaceId", "provider");
