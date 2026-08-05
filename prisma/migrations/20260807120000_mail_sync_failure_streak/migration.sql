-- Failure streak per mail account: syncStatus only flips to ERROR (and alerts)
-- after MAIL_SYNC_FAILURE_THRESHOLD consecutive failed syncs.
-- No backfill needed: accounts already in ERROR keep that status until their
-- next successful sync (see nextMailSyncState()).
ALTER TABLE "MailAccount"
ADD COLUMN "consecutiveSyncFailures" INTEGER NOT NULL DEFAULT 0;
