-- Retention cleanup needs a (status, createdAt) index: the existing
-- (status, nextAttemptAt) index only serves the delivery scheduler's
-- due-query, not a terminal-status createdAt cutoff scan.
CREATE INDEX "WebhookDelivery_status_createdAt_idx"
  ON "WebhookDelivery"("status", "createdAt");
