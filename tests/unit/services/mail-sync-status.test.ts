import { describe, expect, it } from "vitest";
import {
  nextMailSyncState,
  type CurrentMailSyncState,
} from "@/lib/services/mail-sync-status";

// Table-driven tests of the pure nextMailSyncState(), the mail counterpart of
// service-status.ts nextState(). The guarantee under test: a single dropped
// IMAP session never flips the account to ERROR (and so never raises the
// critical "Ошибка синхронизации" alert), while an account already in ERROR
// stays there until it actually syncs again.

describe("nextMailSyncState(): IDLE -> failure", () => {
  it("keeps IDLE with no flip while under the threshold", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "IDLE", consecutiveSyncFailures: 0 },
        false,
        3,
      ),
    ).toEqual({
      syncStatus: "IDLE",
      consecutiveSyncFailures: 1,
      flipped: false,
    });
  });

  it("flips to ERROR exactly when the streak reaches the threshold", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "IDLE", consecutiveSyncFailures: 2 },
        false,
        3,
      ),
    ).toEqual({
      syncStatus: "ERROR",
      consecutiveSyncFailures: 3,
      flipped: true,
    });
  });

  it("flips on the first failure when the threshold is 1", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "IDLE", consecutiveSyncFailures: 0 },
        false,
        1,
      ),
    ).toEqual({
      syncStatus: "ERROR",
      consecutiveSyncFailures: 1,
      flipped: true,
    });
  });

  it("walks IDLE -> IDLE -> ERROR across three failures", () => {
    let current: CurrentMailSyncState = {
      syncStatus: "IDLE",
      consecutiveSyncFailures: 0,
    };

    current = nextMailSyncState(current, false, 3);
    expect(current).toMatchObject({ syncStatus: "IDLE", flipped: false });

    current = nextMailSyncState(current, false, 3);
    expect(current).toMatchObject({ syncStatus: "IDLE", flipped: false });

    expect(nextMailSyncState(current, false, 3)).toEqual({
      syncStatus: "ERROR",
      consecutiveSyncFailures: 3,
      flipped: true,
    });
  });
});

describe("nextMailSyncState(): ERROR -> failure", () => {
  it("stays ERROR with no flip even below the threshold", () => {
    // The freshly reset streak of an account that was already failing must not
    // pull it back out of ERROR.
    expect(
      nextMailSyncState(
        { syncStatus: "ERROR", consecutiveSyncFailures: 0 },
        false,
        3,
      ),
    ).toEqual({
      syncStatus: "ERROR",
      consecutiveSyncFailures: 1,
      flipped: false,
    });
  });

  it("stays ERROR with no flip once past the threshold", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "ERROR", consecutiveSyncFailures: 7 },
        false,
        3,
      ),
    ).toEqual({
      syncStatus: "ERROR",
      consecutiveSyncFailures: 8,
      flipped: false,
    });
  });
});

describe("nextMailSyncState(): success", () => {
  it("resets the streak and flips back on recovery from ERROR", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "ERROR", consecutiveSyncFailures: 5 },
        true,
        3,
      ),
    ).toEqual({
      syncStatus: "IDLE",
      consecutiveSyncFailures: 0,
      flipped: true,
    });
  });

  it("clears a sub-threshold streak without a flip", () => {
    expect(
      nextMailSyncState(
        { syncStatus: "IDLE", consecutiveSyncFailures: 2 },
        true,
        3,
      ),
    ).toEqual({
      syncStatus: "IDLE",
      consecutiveSyncFailures: 0,
      flipped: false,
    });
  });
});
