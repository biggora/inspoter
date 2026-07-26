-- Tracks provider sync health for flip-based alerting
-- (provider-health.ts): an alert fires on OK -> Error and on Error -> OK,
-- not on every repeated failure, so the credential needs to remember
-- whether it was already erroring before this poll.

ALTER TABLE "ProviderCredential"
  ADD COLUMN "lastSyncError" TEXT,
  ADD COLUMN "lastSyncErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncOkAt" TIMESTAMP(3);
