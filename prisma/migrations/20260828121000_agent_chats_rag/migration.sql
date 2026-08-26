-- Hybrid Notes RAG requires a pgvector-capable PostgreSQL image. The extension
-- is additive and remains installed if the application is rolled back.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "NoteIndexJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "EmbeddingBackfillStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'ERROR');

CREATE TABLE "AgentConversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId" TEXT,
  "agentWorkspaceId" TEXT,
  "title" TEXT NOT NULL,
  "createdByOperatorId" TEXT NOT NULL,
  "createdByOperatorName" TEXT NOT NULL,
  "rollingSummary" TEXT,
  "summarizedThroughSequence" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentConversation_agent_pair_check" CHECK (("agentId" IS NULL) = ("agentWorkspaceId" IS NULL)),
  CONSTRAINT "AgentConversation_workspace_consistency_check" CHECK ("agentWorkspaceId" IS NULL OR "workspaceId" = "agentWorkspaceId")
);

CREATE TABLE "AgentConversationEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "conversationWorkspaceId" TEXT NOT NULL,
  "previousAgentId" TEXT,
  "previousAgentName" TEXT,
  "previousScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nextAgentId" TEXT,
  "nextAgentName" TEXT,
  "nextScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actorOperatorId" TEXT NOT NULL,
  "actorOperatorName" TEXT NOT NULL,
  "scopeDowngradeConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "missingScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentConversationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentConversationEvent_workspace_consistency_check" CHECK ("workspaceId" = "conversationWorkspaceId")
);

CREATE TABLE "WorkspaceEmbeddingProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "credentialId" TEXT,
  "credentialWorkspaceId" TEXT,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "backfillStatus" "EmbeddingBackfillStatus" NOT NULL DEFAULT 'PENDING',
  "indexedNotes" INTEGER NOT NULL DEFAULT 0,
  "totalNotes" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceEmbeddingProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceEmbeddingProfile_credential_pair_check" CHECK (("credentialId" IS NULL) = ("credentialWorkspaceId" IS NULL)),
  CONSTRAINT "WorkspaceEmbeddingProfile_workspace_consistency_check" CHECK ("credentialWorkspaceId" IS NULL OR "workspaceId" = "credentialWorkspaceId"),
  CONSTRAINT "WorkspaceEmbeddingProfile_dimensions_check" CHECK ("dimensions" > 0)
);

CREATE TABLE "NoteChunk" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "noteWorkspaceId" TEXT NOT NULL,
  "noteVersion" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "headingPath" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "profileRevision" INTEGER NOT NULL,
  "embedding" vector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoteChunk_workspace_consistency_check" CHECK ("workspaceId" = "noteWorkspaceId")
);

CREATE TABLE "NoteIndexJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "profileWorkspaceId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "noteWorkspaceId" TEXT NOT NULL,
  "noteVersion" INTEGER NOT NULL,
  "profileRevision" INTEGER NOT NULL,
  "status" "NoteIndexJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NoteIndexJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoteIndexJob_workspace_consistency_check" CHECK ("workspaceId" = "profileWorkspaceId" AND "workspaceId" = "noteWorkspaceId")
);

ALTER TABLE "AgentRun"
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "conversationWorkspaceId" TEXT,
  ADD COLUMN "conversationSequence" INTEGER,
  ADD COLUMN "ragMode" TEXT,
  ADD COLUMN "ragSources" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversation_pair_check"
  CHECK (("conversationId" IS NULL) = ("conversationWorkspaceId" IS NULL));
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversation_workspace_check"
  CHECK ("conversationWorkspaceId" IS NULL OR "workspaceId" = "conversationWorkspaceId");

CREATE UNIQUE INDEX "AgentConversation_id_workspaceId_key" ON "AgentConversation"("id", "workspaceId");
CREATE INDEX "AgentConversation_workspaceId_archivedAt_lastMessageAt_id_idx" ON "AgentConversation"("workspaceId", "archivedAt", "lastMessageAt", "id");
CREATE INDEX "AgentConversationEvent_workspaceId_conversationId_createdAt_id_idx" ON "AgentConversationEvent"("workspaceId", "conversationId", "createdAt", "id");
CREATE UNIQUE INDEX "WorkspaceEmbeddingProfile_workspaceId_key" ON "WorkspaceEmbeddingProfile"("workspaceId");
CREATE INDEX "WorkspaceEmbeddingProfile_credentialId_credentialWorkspaceId_idx" ON "WorkspaceEmbeddingProfile"("credentialId", "credentialWorkspaceId");
CREATE UNIQUE INDEX "NoteChunk_noteId_noteVersion_profileRevision_position_key" ON "NoteChunk"("noteId", "noteVersion", "profileRevision", "position");
CREATE INDEX "NoteChunk_workspaceId_profileRevision_noteId_noteVersion_idx" ON "NoteChunk"("workspaceId", "profileRevision", "noteId", "noteVersion");
CREATE UNIQUE INDEX "NoteIndexJob_noteId_noteVersion_profileRevision_key" ON "NoteIndexJob"("noteId", "noteVersion", "profileRevision");
CREATE INDEX "NoteIndexJob_status_nextAttemptAt_createdAt_id_idx" ON "NoteIndexJob"("status", "nextAttemptAt", "createdAt", "id");
CREATE INDEX "NoteIndexJob_status_leaseExpiresAt_id_idx" ON "NoteIndexJob"("status", "leaseExpiresAt", "id");
CREATE INDEX "NoteIndexJob_workspaceId_profileRevision_noteId_idx" ON "NoteIndexJob"("workspaceId", "profileRevision", "noteId");
CREATE UNIQUE INDEX "AgentRun_conversationId_conversationSequence_key" ON "AgentRun"("conversationId", "conversationSequence");
CREATE INDEX "AgentRun_workspaceId_conversationId_conversationSequence_idx" ON "AgentRun"("workspaceId", "conversationId", "conversationSequence");
CREATE UNIQUE INDEX "AgentRun_one_active_conversation_turn_idx" ON "AgentRun"("conversationId") WHERE "conversationId" IS NOT NULL AND "status" IN ('PENDING', 'RUNNING');

ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_agentId_agentWorkspaceId_fkey" FOREIGN KEY ("agentId", "agentWorkspaceId") REFERENCES "Agent"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentConversationEvent" ADD CONSTRAINT "AgentConversationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConversationEvent" ADD CONSTRAINT "AgentConversationEvent_conversationId_conversationWorkspaceId_fkey" FOREIGN KEY ("conversationId", "conversationWorkspaceId") REFERENCES "AgentConversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceEmbeddingProfile" ADD CONSTRAINT "WorkspaceEmbeddingProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceEmbeddingProfile" ADD CONSTRAINT "WorkspaceEmbeddingProfile_credentialId_credentialWorkspaceId_fkey" FOREIGN KEY ("credentialId", "credentialWorkspaceId") REFERENCES "ProviderCredential"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteChunk" ADD CONSTRAINT "NoteChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteChunk" ADD CONSTRAINT "NoteChunk_noteId_noteWorkspaceId_fkey" FOREIGN KEY ("noteId", "noteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteIndexJob" ADD CONSTRAINT "NoteIndexJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteIndexJob" ADD CONSTRAINT "NoteIndexJob_profileWorkspaceId_fkey" FOREIGN KEY ("profileWorkspaceId") REFERENCES "WorkspaceEmbeddingProfile"("workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteIndexJob" ADD CONSTRAINT "NoteIndexJob_noteId_noteWorkspaceId_fkey" FOREIGN KEY ("noteId", "noteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_conversationWorkspaceId_fkey" FOREIGN KEY ("conversationId", "conversationWorkspaceId") REFERENCES "AgentConversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
