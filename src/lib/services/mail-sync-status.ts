import type { MailSyncStatus } from "@/generated/prisma/client";

// Pure, dependency-free status-flip logic for mail account syncs, mirroring
// src/lib/services/service-status.ts. A single failed IMAP session (a slow
// handshake, a dropped socket) is not an outage: the account only flips to
// ERROR — and only then raises an alert — after `threshold` consecutive
// failures.

export interface CurrentMailSyncState {
  /** Status as stored *before* the sync lease was taken (never SYNCING). */
  syncStatus: MailSyncStatus;
  consecutiveSyncFailures: number;
}

export interface NextMailSyncState {
  syncStatus: MailSyncStatus;
  consecutiveSyncFailures: number;
  flipped: boolean;
}

// `flipped` marks the ERROR ⇄ non-ERROR transitions that deserve an alert:
// repeated failures past the threshold, and repeated successes, stay silent.
export function nextMailSyncState(
  current: CurrentMailSyncState,
  ok: boolean,
  threshold: number,
): NextMailSyncState {
  if (ok) {
    return {
      syncStatus: "IDLE",
      consecutiveSyncFailures: 0,
      flipped: current.syncStatus === "ERROR",
    };
  }

  const consecutiveSyncFailures = current.consecutiveSyncFailures + 1;
  if (consecutiveSyncFailures >= threshold) {
    return {
      syncStatus: "ERROR",
      consecutiveSyncFailures,
      flipped: current.syncStatus !== "ERROR",
    };
  }

  // Below the threshold the previous status is kept, so an account already in
  // ERROR does not fall out of it on the way to the next failure.
  return {
    syncStatus: current.syncStatus,
    consecutiveSyncFailures,
    flipped: false,
  };
}
