-- CreateEnum
CREATE TYPE "LocalServerOrigin" AS ENUM ('PROVIDER', 'AGENT');
CREATE TYPE "ServerAddressFamily" AS ENUM ('IPV4', 'IPV6');
CREATE TYPE "ServerAddressScope" AS ENUM ('GLOBAL', 'PRIVATE', 'LINK_LOCAL', 'LOOPBACK', 'RESERVED', 'OTHER');
CREATE TYPE "ServerAddressSource" AS ENUM ('PROVIDER', 'AGENT');
CREATE TYPE "ServerAgentTokenState" AS ENUM ('UNBOUND', 'BOUND', 'REVOKED');

-- Add compound unique to ProviderCredential for tenant-safe LocalServer relation
CREATE UNIQUE INDEX "ProviderCredential_id_workspaceId_key" ON "ProviderCredential"("id", "workspaceId");

-- CreateTable: LocalServer
CREATE TABLE "LocalServer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "origin" "LocalServerOrigin" NOT NULL,
    "displayName" TEXT NOT NULL,
    "hostname" TEXT,
    "providerCredentialId" TEXT,
    "providerCredentialWorkspaceId" TEXT,
    "providerRemoteId" TEXT,
    "providerLastSeenAt" TIMESTAMP(3),
    "providerMissingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LocalServerAddress
CREATE TABLE "LocalServerAddress" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localServerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "family" "ServerAddressFamily" NOT NULL,
    "scope" "ServerAddressScope" NOT NULL,
    "source" "ServerAddressSource" NOT NULL,
    "matchKey" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "isEnrollmentClaim" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "claimConflictAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalServerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ServerAgentToken
CREATE TABLE "ServerAgentToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localServerId" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "state" "ServerAgentTokenState" NOT NULL DEFAULT 'UNBOUND',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ServerAgentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ServerMetricSnapshot
CREATE TABLE "ServerMetricSnapshot" (
    "localServerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuUsagePercent" DOUBLE PRECISION NOT NULL,
    "load1" DOUBLE PRECISION NOT NULL,
    "load5" DOUBLE PRECISION NOT NULL,
    "load15" DOUBLE PRECISION NOT NULL,
    "memoryTotalBytes" BIGINT NOT NULL,
    "memoryAvailableBytes" BIGINT NOT NULL,
    "swapTotalBytes" BIGINT NOT NULL,
    "swapFreeBytes" BIGINT NOT NULL,
    "filesystemTotalBytes" BIGINT NOT NULL,
    "filesystemAvailableBytes" BIGINT NOT NULL,
    "uptimeSeconds" BIGINT NOT NULL,

    CONSTRAINT "ServerMetricSnapshot_pkey" PRIMARY KEY ("localServerId")
);

-- CreateIndex: LocalServer
CREATE UNIQUE INDEX "LocalServer_id_workspaceId_key" ON "LocalServer"("id", "workspaceId");
CREATE UNIQUE INDEX "LocalServer_workspaceId_providerCredentialId_providerRemoteId_key" ON "LocalServer"("workspaceId", "providerCredentialId", "providerRemoteId");
CREATE INDEX "LocalServer_workspaceId_origin_createdAt_id_idx" ON "LocalServer"("workspaceId", "origin", "createdAt", "id");
CREATE INDEX "LocalServer_workspaceId_providerMissingAt_idx" ON "LocalServer"("workspaceId", "providerMissingAt");

-- CreateIndex: LocalServerAddress
CREATE UNIQUE INDEX "LocalServerAddress_workspaceId_localServerId_address_source_key" ON "LocalServerAddress"("workspaceId", "localServerId", "address", "source");
CREATE INDEX "LocalServerAddress_workspaceId_address_idx" ON "LocalServerAddress"("workspaceId", "address");
CREATE INDEX "LocalServerAddress_workspaceId_localServerId_idx" ON "LocalServerAddress"("workspaceId", "localServerId");

-- CreateIndex: ServerAgentToken
CREATE UNIQUE INDEX "ServerAgentToken_tokenHash_key" ON "ServerAgentToken"("tokenHash");
CREATE UNIQUE INDEX "ServerAgentToken_id_workspaceId_key" ON "ServerAgentToken"("id", "workspaceId");
CREATE INDEX "ServerAgentToken_workspaceId_state_createdAt_id_idx" ON "ServerAgentToken"("workspaceId", "state", "createdAt", "id");
CREATE INDEX "ServerAgentToken_workspaceId_localServerId_idx" ON "ServerAgentToken"("workspaceId", "localServerId");

-- CreateIndex: ServerMetricSnapshot
CREATE UNIQUE INDEX "ServerMetricSnapshot_localServerId_workspaceId_key" ON "ServerMetricSnapshot"("localServerId", "workspaceId");
CREATE INDEX "ServerMetricSnapshot_workspaceId_receivedAt_idx" ON "ServerMetricSnapshot"("workspaceId", "receivedAt");

-- AddForeignKey: LocalServer -> Workspace
ALTER TABLE "LocalServer" ADD CONSTRAINT "LocalServer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: LocalServer -> ProviderCredential (Restrict)
ALTER TABLE "LocalServer" ADD CONSTRAINT "LocalServer_providerCredentialId_providerCredentialWorkspaceId_fkey" FOREIGN KEY ("providerCredentialId", "providerCredentialWorkspaceId") REFERENCES "ProviderCredential"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LocalServerAddress -> LocalServer
ALTER TABLE "LocalServerAddress" ADD CONSTRAINT "LocalServerAddress_localServerId_workspaceId_fkey" FOREIGN KEY ("localServerId", "workspaceId") REFERENCES "LocalServer"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ServerAgentToken -> Workspace
ALTER TABLE "ServerAgentToken" ADD CONSTRAINT "ServerAgentToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ServerAgentToken -> LocalServer
ALTER TABLE "ServerAgentToken" ADD CONSTRAINT "ServerAgentToken_localServerId_workspaceId_fkey" FOREIGN KEY ("localServerId", "workspaceId") REFERENCES "LocalServer"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ServerMetricSnapshot -> LocalServer
ALTER TABLE "ServerMetricSnapshot" ADD CONSTRAINT "ServerMetricSnapshot_localServerId_workspaceId_fkey" FOREIGN KEY ("localServerId", "workspaceId") REFERENCES "LocalServer"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Hand-authored constraints not expressible in Prisma DSL
-- (specs/metrics-script.md §8)
-- ============================================================

-- CHECK: AGENT origin must have NULL provider tuple; PROVIDER origin must have
-- non-null credential/remote and credential workspace must match server workspace.
ALTER TABLE "LocalServer"
ADD CONSTRAINT "LocalServer_origin_provider_tuple_check" CHECK (
  ("origin" = 'AGENT'
    AND "providerCredentialId" IS NULL
    AND "providerCredentialWorkspaceId" IS NULL
    AND "providerRemoteId" IS NULL)
  OR
  ("origin" = 'PROVIDER'
    AND "providerCredentialId" IS NOT NULL
    AND "providerCredentialWorkspaceId" = "workspaceId"
    AND "providerRemoteId" IS NOT NULL
    AND length(trim("providerRemoteId")) > 0)
);

-- CHECK: Token state field combinations must be consistent.
ALTER TABLE "ServerAgentToken"
ADD CONSTRAINT "ServerAgentToken_state_fields_check" CHECK (
  ("state" = 'UNBOUND'
    AND "localServerId" IS NULL
    AND "boundAt" IS NULL
    AND "revokedAt" IS NULL
    AND "expiresAt" IS NOT NULL
    AND "expiresAt" > "createdAt")
  OR
  ("state" = 'BOUND'
    AND "localServerId" IS NOT NULL
    AND "boundAt" IS NOT NULL
    AND "revokedAt" IS NULL
    AND "expiresAt" IS NULL)
  OR
  ("state" = 'REVOKED'
    AND "revokedAt" IS NOT NULL
    AND (("localServerId" IS NULL AND "boundAt" IS NULL AND "expiresAt" IS NOT NULL)
      OR ("localServerId" IS NOT NULL AND "boundAt" IS NOT NULL AND "expiresAt" IS NULL)))
);

-- Partial unique: at most one non-revoked BOUND token per local server.
CREATE UNIQUE INDEX "server_agent_token_one_active_bound_per_server"
ON "ServerAgentToken" ("localServerId")
WHERE "state" = 'BOUND' AND "revokedAt" IS NULL;

-- Partial unique: at most one current global IPv4 enrollment claim per workspace.
CREATE UNIQUE INDEX "local_server_address_one_current_ipv4_claim"
ON "LocalServerAddress" ("workspaceId", "matchKey")
WHERE "isCurrent" = true
  AND "isEnrollmentClaim" = true
  AND "matchKey" IS NOT NULL;

-- CHECK: Enrollment claim rows must be current, non-retired, IPv4, GLOBAL scope,
-- and matchKey must equal the canonical address.
ALTER TABLE "LocalServerAddress"
ADD CONSTRAINT "LocalServerAddress_claim_fields_check" CHECK (
  ("isEnrollmentClaim" = false AND "matchKey" IS NULL)
  OR
  ("isEnrollmentClaim" = true
    AND "isCurrent" = true
    AND "retiredAt" IS NULL
    AND "family" = 'IPV4'
    AND "scope" = 'GLOBAL'
    AND "matchKey" = "address")
);
