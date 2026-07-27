-- Provider listing cache (ADR-004 amendment). Listing a section used to fan
-- out to the provider on every page visit — one call per credential plus one
-- per zone for the DNS record counts. The listing now lands here and the page
-- reads it back, while provider-snapshot-scheduler.ts keeps it fresh.
--
-- Non-authoritative by construction: mutations still go straight to the
-- provider API, and the whole table can be dropped without data loss, which
-- is why it stays out of backup/restore (same as ServerMetricSnapshot).

CREATE TYPE "ProviderSnapshotKind" AS ENUM ('DNS_ZONES', 'HOSTING_ACCOUNTS', 'SERVERS');

CREATE TABLE "ProviderSnapshot" (
  "workspaceId"  TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "kind"         "ProviderSnapshotKind" NOT NULL,
  "payload"      JSONB NOT NULL,
  "error"        TEXT,
  "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderSnapshot_pkey" PRIMARY KEY ("credentialId", "kind")
);

CREATE INDEX "ProviderSnapshot_workspaceId_kind_idx" ON "ProviderSnapshot" ("workspaceId", "kind");

-- Cross-tenant by design: the scheduler scans every workspace for due rows.
CREATE INDEX "ProviderSnapshot_kind_fetchedAt_idx" ON "ProviderSnapshot" ("kind", "fetchedAt");

ALTER TABLE "ProviderSnapshot"
  ADD CONSTRAINT "ProviderSnapshot_credentialId_workspaceId_fkey"
  FOREIGN KEY ("credentialId", "workspaceId")
  REFERENCES "ProviderCredential" ("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Kill switches for the automatic refresh: one per credential, one per
-- section. Both default to "refresh enabled" so existing deployments keep
-- their current behaviour.
ALTER TABLE "ProviderCredential"
  ADD COLUMN "autoRefreshEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Workspace"
  ADD COLUMN "autoRefreshDisabledKinds" "ProviderSnapshotKind"[] NOT NULL DEFAULT ARRAY[]::"ProviderSnapshotKind"[];
