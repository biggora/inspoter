-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('CLOUDFLARE_DNS', 'HETZNER_DNS', 'HETZNER_CLOUD', 'GODADDY_DNS');

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "maskedHint" TEXT NOT NULL,
    "isValid" BOOLEAN,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCredential_workspaceId_idx" ON "ProviderCredential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_workspaceId_provider_key" ON "ProviderCredential"("workspaceId", "provider");

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ProviderResourceBinding_operationState_operationLeaseExpiresAt_" RENAME TO "ProviderResourceBinding_operationState_operationLeaseExpire_idx";

-- RenameIndex
ALTER INDEX "ProviderResourceBinding_provider_accountKey_resourceType_mode_r" RENAME TO "ProviderResourceBinding_provider_accountKey_resourceType_mo_key";

-- RenameIndex
ALTER INDEX "ProviderResourceBinding_workspaceId_resourceType_provider_mode_" RENAME TO "ProviderResourceBinding_workspaceId_resourceType_provider_m_idx";
