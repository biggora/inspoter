import { env } from "@/lib/config/env";
import { logError } from "@/lib/services/logs";
import {
  listDueCredentials,
  type RefreshFn,
  type SnapshotKind,
} from "@/lib/services/provider-snapshots";
import { refreshDnsSnapshots } from "./domains";
import { refreshHostingSnapshots } from "./hosting";
import { refreshServerSnapshots } from "./servers";

// Background refresh for the provider listing cache (provider-snapshots.ts).
// Without it a snapshot would only ever be refreshed by whoever happened to
// open the page, which also means provider outages would go unnoticed —
// alerts and Logs entries now fire on a timer instead of on a page visit.
//
// Same in-process design as the other schedulers (see scheduler.ts): the app
// is a single long-lived Node process, so a setInterval guarded against
// hot-reload duplication is enough.

const globalForScheduler = globalThis as unknown as {
  __inspoterProviderSnapshotSchedulerStarted?: boolean;
};

// Bounded concurrency: a refresh is a provider fan-out, so a workspace with
// many credentials must not fire them all at once.
const CHUNK_SIZE = 5;

const REFRESHERS: Array<{ kind: SnapshotKind; refresh: RefreshFn }> = [
  { kind: "DNS_ZONES", refresh: refreshDnsSnapshots },
  { kind: "HOSTING_ACCOUNTS", refresh: refreshHostingSnapshots },
  { kind: "SERVERS", refresh: refreshServerSnapshots },
];

let tickInFlight = false;

async function processInChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map((item) => fn(item)));
  }
}

async function refreshOneWorkspace(
  kind: SnapshotKind,
  refresh: RefreshFn,
  workspaceId: string,
  credentialIds: string[],
): Promise<void> {
  try {
    await refresh(workspaceId, credentialIds);
  } catch (error) {
    // Provider failures are handled in-band by the refresh functions (they
    // persist an error snapshot and log the transition). Reaching here means
    // the mechanism itself broke, and one broken workspace must never stop
    // the interval or the other workspaces in its chunk.
    console.error(
      `[provider-snapshot-scheduler] refresh failed (${kind}, workspace ${workspaceId}):`,
      error,
    );
    logError(
      workspaceId,
      "scheduler:provider-snapshot",
      `Snapshot refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      JSON.stringify({ kind, credentialIds }),
    );
  }
}

async function refreshKind(
  kind: SnapshotKind,
  refresh: RefreshFn,
): Promise<void> {
  const due = await listDueCredentials(kind);
  if (due.length === 0) return;

  const byWorkspace = new Map<string, string[]>();
  for (const entry of due) {
    const existing = byWorkspace.get(entry.workspaceId);
    if (existing) {
      existing.push(entry.credentialId);
    } else {
      byWorkspace.set(entry.workspaceId, [entry.credentialId]);
    }
  }

  await processInChunks([...byWorkspace], CHUNK_SIZE, ([workspaceId, ids]) =>
    refreshOneWorkspace(kind, refresh, workspaceId, ids),
  );
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    for (const { kind, refresh } of REFRESHERS) {
      await refreshKind(kind, refresh);
    }
  } catch (error) {
    // No workspace to attribute this to — console only, matching the other
    // schedulers' tick-level handling.
    console.error("[provider-snapshot-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startProviderSnapshotScheduler(): void {
  if (globalForScheduler.__inspoterProviderSnapshotSchedulerStarted) return;
  globalForScheduler.__inspoterProviderSnapshotSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.PROVIDER_SNAPSHOT_TICK_MS);
}
