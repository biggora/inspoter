CREATE TABLE "ContactCreateRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "callerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactCreateRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactCreateRequest_workspaceId_callerId_key_key"
  ON "ContactCreateRequest"("workspaceId", "callerId", "key");
CREATE INDEX "ContactCreateRequest_workspaceId_createdAt_idx"
  ON "ContactCreateRequest"("workspaceId", "createdAt");

ALTER TABLE "ContactCreateRequest"
  ADD CONSTRAINT "ContactCreateRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
