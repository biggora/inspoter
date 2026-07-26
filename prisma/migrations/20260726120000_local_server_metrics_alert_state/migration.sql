-- Tracks the last known metrics-agent health state for the staleness
-- scheduler (metrics-staleness-scheduler.ts): "live" while snapshots keep
-- arriving within the staleness window, "stale" once they stop, so the
-- scheduler can detect live<->stale transitions without re-deriving state
-- from timestamps alone.

ALTER TABLE "LocalServer"
  ADD COLUMN "metricsAlertState" TEXT;
