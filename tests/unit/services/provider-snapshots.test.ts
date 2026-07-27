import { describe, expect, it, vi } from "vitest";
import {
  resolveReadPlan,
  withSingleFlight,
  type CredentialRef,
  type SnapshotRow,
} from "@/lib/services/provider-snapshots";

// Staleness rules of the provider listing cache. resolveReadPlan is pure, so
// the whole decision table is testable without a database.

const NOW = new Date("2026-07-27T12:00:00.000Z").getTime();
const TTL = 300_000; // 5 minutes, the production default

function credential(id: string, autoRefreshEnabled = true): CredentialRef {
  return { id, autoRefreshEnabled };
}

function snapshot(credentialId: string, ageMs: number): SnapshotRow {
  return {
    credentialId,
    kind: "DNS_ZONES",
    payload: { providerId: credentialId },
    error: null,
    fetchedAt: new Date(NOW - ageMs),
  };
}

describe("resolveReadPlan()", () => {
  it("serves a snapshot inside the TTL without scheduling any refresh", () => {
    const plan = resolveReadPlan([credential("a")], [snapshot("a", 60_000)], {
      ttlMs: TTL,
      now: NOW,
      autoRefreshAllowed: true,
    });

    expect(plan.fresh.map((row) => row.credentialId)).toEqual(["a"]);
    expect(plan.stale).toHaveLength(0);
    expect(plan.missing).toHaveLength(0);
  });

  it("marks a snapshot past the TTL stale so it is served and refreshed behind the render", () => {
    const plan = resolveReadPlan([credential("a")], [snapshot("a", TTL + 1)], {
      ttlMs: TTL,
      now: NOW,
      autoRefreshAllowed: true,
    });

    expect(plan.stale.map((row) => row.credentialId)).toEqual(["a"]);
    expect(plan.fresh).toHaveLength(0);
  });

  it("reports a credential with no snapshot as missing, so the caller fetches before rendering", () => {
    const plan = resolveReadPlan([credential("a")], [], {
      ttlMs: TTL,
      now: NOW,
      autoRefreshAllowed: true,
    });

    expect(plan.missing).toEqual(["a"]);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.stale).toHaveLength(0);
  });

  it("keeps serving an expired snapshot as fresh when the credential's auto refresh is off", () => {
    const plan = resolveReadPlan(
      [credential("a", false)],
      [snapshot("a", TTL * 10)],
      { ttlMs: TTL, now: NOW, autoRefreshAllowed: true },
    );

    expect(plan.fresh.map((row) => row.credentialId)).toEqual(["a"]);
    expect(plan.stale).toHaveLength(0);
  });

  it("keeps serving an expired snapshot as fresh when the whole section's auto refresh is off", () => {
    const plan = resolveReadPlan([credential("a")], [snapshot("a", TTL * 10)], {
      ttlMs: TTL,
      now: NOW,
      autoRefreshAllowed: false,
    });

    expect(plan.fresh.map((row) => row.credentialId)).toEqual(["a"]);
    expect(plan.stale).toHaveLength(0);
  });

  it("still fetches a credential that has no snapshot at all when auto refresh is off", () => {
    // Disabling automatic refresh freezes the data; it must never leave the
    // section permanently empty.
    const plan = resolveReadPlan([credential("a", false)], [], {
      ttlMs: TTL,
      now: NOW,
      autoRefreshAllowed: false,
    });

    expect(plan.missing).toEqual(["a"]);
  });

  it("classifies each credential independently", () => {
    const plan = resolveReadPlan(
      [credential("fresh"), credential("stale"), credential("cold")],
      [snapshot("fresh", 1_000), snapshot("stale", TTL + 1)],
      { ttlMs: TTL, now: NOW, autoRefreshAllowed: true },
    );

    expect(plan.fresh.map((row) => row.credentialId)).toEqual(["fresh"]);
    expect(plan.stale.map((row) => row.credentialId)).toEqual(["stale"]);
    expect(plan.missing).toEqual(["cold"]);
  });
});

describe("withSingleFlight()", () => {
  it("collapses concurrent calls on one key into a single fetch", async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(() => pending);

    const first = withSingleFlight("DNS_ZONES:w1:a", fetcher);
    const second = withSingleFlight("DNS_ZONES:w1:a", fetcher);

    release("done");
    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("runs again once the previous flight has settled", async () => {
    const fetcher = vi.fn(async () => "done");

    await withSingleFlight("DNS_ZONES:w1:b", fetcher);
    await withSingleFlight("DNS_ZONES:w1:b", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps different credential sets apart", async () => {
    const fetcher = vi.fn(async () => "done");

    await Promise.all([
      withSingleFlight("DNS_ZONES:w1:c", fetcher),
      withSingleFlight("DNS_ZONES:w1:d", fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("releases the key after a failure so the next caller can retry", async () => {
    const failing = vi.fn(async () => {
      throw new Error("provider down");
    });

    await expect(withSingleFlight("DNS_ZONES:w1:e", failing)).rejects.toThrow(
      "provider down",
    );
    await expect(withSingleFlight("DNS_ZONES:w1:e", failing)).rejects.toThrow(
      "provider down",
    );
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
