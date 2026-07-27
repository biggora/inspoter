import type {
  ProviderSnapshotKind,
  ProviderType,
} from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import {
  DNS_PROVIDER_TYPES,
  HOSTING_PROVIDER_TYPES,
} from "@/lib/providers/registry";
import { logError } from "@/lib/services/logs";

// Provider listing cache (ADR-004 amendment). Listing a section used to cost
// an N+1 fan-out to the provider on every page visit — one call per
// credential, plus one per zone for the DNS record counts. The listing now
// lands in ProviderSnapshot and the page reads it back, so a render is a
// constant number of SQL queries and zero network calls.
//
// This module owns only the generic read/write mechanics. The provider
// fan-out itself stays in the three domain services (domains.ts, hosting.ts,
// servers.ts), each of which exposes a `refresh*` function that this module's
// scheduler and the manual-refresh routes call.

export type SnapshotKind = ProviderSnapshotKind;

// Which credential types feed which section. Hetzner Cloud is registered
// under the HOSTING category but belongs to the Servers section — the same
// split providers/hosting/index.ts makes.
const CREDENTIAL_TYPES_BY_KIND: Record<SnapshotKind, ProviderType[]> = {
  DNS_ZONES: DNS_PROVIDER_TYPES,
  HOSTING_ACCOUNTS: HOSTING_PROVIDER_TYPES.filter(
    (type) => type !== "HETZNER_CLOUD",
  ),
  SERVERS: ["HETZNER_CLOUD"],
};

export interface SnapshotRow {
  credentialId: string;
  kind: SnapshotKind;
  payload: unknown;
  error: string | null;
  fetchedAt: Date;
}

export interface CredentialRef {
  id: string;
  autoRefreshEnabled: boolean;
}

export async function listCredentialsForKind(
  workspaceId: string,
  kind: SnapshotKind,
): Promise<CredentialRef[]> {
  return db.providerCredential.findMany({
    where: { workspaceId, provider: { in: CREDENTIAL_TYPES_BY_KIND[kind] } },
    select: { id: true, autoRefreshEnabled: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function readSnapshots(
  workspaceId: string,
  kind: SnapshotKind,
): Promise<SnapshotRow[]> {
  return db.providerSnapshot.findMany({
    where: { workspaceId, kind },
    select: {
      credentialId: true,
      kind: true,
      payload: true,
      error: true,
      fetchedAt: true,
    },
  });
}

export async function writeSnapshot(
  workspaceId: string,
  credentialId: string,
  kind: SnapshotKind,
  payload: unknown,
  error: string | null,
): Promise<void> {
  const data = {
    payload: payload as never,
    error,
    fetchedAt: new Date(),
  };
  await db.providerSnapshot.upsert({
    where: { credentialId_kind: { credentialId, kind } },
    create: { workspaceId, credentialId, kind, ...data },
    update: data,
  });
}

// Used after a mutation whose effect the cached listing can't derive (a
// suspended account, a powered-off machine): the row keeps serving until the
// next read, which then treats it as stale and refreshes it.
export async function markStale(
  credentialId: string,
  kind: SnapshotKind,
): Promise<void> {
  await db.providerSnapshot
    .update({
      where: { credentialId_kind: { credentialId, kind } },
      data: { fetchedAt: new Date(0) },
    })
    .catch(() => {
      // No snapshot yet — the next read fetches from the provider anyway.
    });
}

export interface ReadPlan {
  /** Snapshot exists and is within the TTL — serve as is. */
  fresh: SnapshotRow[];
  /** No snapshot at all — must be fetched before the section can render. */
  missing: string[];
  /** Snapshot is past the TTL — serve it, then refresh in the background. */
  stale: SnapshotRow[];
}

// Pure, so the staleness rules are testable without a database.
//
// `autoRefreshAllowed` gates only the background half: a credential (or a
// whole section) with automatic refresh switched off keeps serving its
// snapshot indefinitely, but a credential that has no snapshot yet is still
// fetched — otherwise switching the toggle off would leave the section
// permanently empty rather than merely frozen.
export function resolveReadPlan(
  credentials: CredentialRef[],
  snapshots: SnapshotRow[],
  options: { ttlMs: number; now: number; autoRefreshAllowed: boolean },
): ReadPlan {
  const byCredentialId = new Map(
    snapshots.map((row) => [row.credentialId, row]),
  );
  const plan: ReadPlan = { fresh: [], missing: [], stale: [] };

  for (const credential of credentials) {
    const snapshot = byCredentialId.get(credential.id);
    if (!snapshot) {
      plan.missing.push(credential.id);
      continue;
    }
    const expired = options.now - snapshot.fetchedAt.getTime() >= options.ttlMs;
    const refreshable =
      options.autoRefreshAllowed && credential.autoRefreshEnabled;
    if (expired && refreshable) {
      plan.stale.push(snapshot);
    } else {
      plan.fresh.push(snapshot);
    }
  }

  return plan;
}

// Two concurrent requests hitting a cold or stale section must not both fan
// out to the provider. Same "state lives in the process" trade-off as the
// in-process rate limiter (ADR-006) — the deployment is a single long-lived
// Node process.
const inFlight = new Map<string, Promise<unknown>>();

export function withSingleFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export type RefreshFn = (
  workspaceId: string,
  credentialIds: string[],
) => Promise<void>;

// The read path shared by all three sections: serve the cache, fetch only
// what has never been fetched, and let anything merely stale refresh behind
// the render.
//
// Rows come back in credential creation order, which the callers rely on —
// domains.ts's dedupeZones keeps the zone in the *first* credential that
// listed it, so a shuffled order would silently move DNS edits to a
// different account.
export async function readCachedListing(
  workspaceId: string,
  kind: SnapshotKind,
  refresh: RefreshFn,
): Promise<SnapshotRow[]> {
  const [credentials, snapshots, autoRefreshAllowed] = await Promise.all([
    listCredentialsForKind(workspaceId, kind),
    readSnapshots(workspaceId, kind),
    isSectionAutoRefreshEnabled(workspaceId, kind),
  ]);
  if (credentials.length === 0) return [];

  const plan = resolveReadPlan(credentials, snapshots, {
    ttlMs: env.PROVIDER_SNAPSHOT_TTL_MS,
    now: Date.now(),
    autoRefreshAllowed,
  });

  const byCredentialId = new Map(
    [...plan.fresh, ...plan.stale].map((row) => [row.credentialId, row]),
  );

  if (plan.missing.length > 0) {
    // Blocking: without this the section would render empty right after a
    // credential is added, which reads as "the provider has nothing".
    await runRefresh(workspaceId, kind, plan.missing, refresh);
    for (const row of await readSnapshots(workspaceId, kind)) {
      if (!byCredentialId.has(row.credentialId)) {
        byCredentialId.set(row.credentialId, row);
      }
    }
  }

  if (plan.stale.length > 0) {
    void runRefresh(
      workspaceId,
      kind,
      plan.stale.map((row) => row.credentialId),
      refresh,
    );
  }

  return credentials
    .map((credential) => byCredentialId.get(credential.id))
    .filter((row): row is SnapshotRow => row !== undefined);
}

async function runRefresh(
  workspaceId: string,
  kind: SnapshotKind,
  credentialIds: string[],
  refresh: RefreshFn,
): Promise<void> {
  // Keyed on the exact credential set so a joined flight always covers what
  // the joiner asked for. Concurrent renders of the same page produce the
  // same set, which is the case worth collapsing.
  const key = `${kind}:${workspaceId}:${[...credentialIds].sort().join(",")}`;
  await withSingleFlight(key, () => refresh(workspaceId, credentialIds)).catch(
    (error) => {
      // Provider failures are already handled in-band by the refresh functions
      // (they persist an error snapshot). Reaching here means the mechanism
      // itself broke — a database error or a bug — and the render continues
      // with whatever the cache still holds.
      console.error(
        `[provider-snapshots] refresh failed (${kind}, workspace ${workspaceId}):`,
        error,
      );
      logError(
        workspaceId,
        "scheduler:provider-snapshot",
        `Snapshot refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        JSON.stringify({ kind, credentialIds }),
      );
    },
  );
}

export interface DueCredential {
  workspaceId: string;
  credentialId: string;
}

// Scheduler due-scan, cross-tenant by design. Skips credentials whose
// automatic refresh is off and workspaces that switched the section off; a
// credential with no snapshot at all is due, so a freshly added one gets
// picked up without waiting for someone to open the page.
export async function listDueCredentials(
  kind: SnapshotKind,
  now: Date = new Date(),
): Promise<DueCredential[]> {
  const enabledWorkspaces = await db.workspace.findMany({
    where: { NOT: { autoRefreshDisabledKinds: { has: kind } } },
    select: { id: true },
  });
  if (enabledWorkspaces.length === 0) return [];

  const workspaceIds = enabledWorkspaces.map((workspace) => workspace.id);
  const credentials = await db.providerCredential.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      autoRefreshEnabled: true,
      provider: { in: CREDENTIAL_TYPES_BY_KIND[kind] },
    },
    select: { id: true, workspaceId: true },
  });
  if (credentials.length === 0) return [];

  const cutoff = new Date(now.getTime() - env.PROVIDER_SNAPSHOT_TTL_MS);
  const upToDate = await db.providerSnapshot.findMany({
    where: {
      kind,
      credentialId: { in: credentials.map((credential) => credential.id) },
      fetchedAt: { gte: cutoff },
    },
    select: { credentialId: true },
  });
  const upToDateIds = new Set(upToDate.map((row) => row.credentialId));

  return credentials
    .filter((credential) => !upToDateIds.has(credential.id))
    .map((credential) => ({
      workspaceId: credential.workspaceId,
      credentialId: credential.id,
    }));
}

export async function isSectionAutoRefreshEnabled(
  workspaceId: string,
  kind: SnapshotKind,
): Promise<boolean> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { autoRefreshDisabledKinds: true },
  });
  return !workspace?.autoRefreshDisabledKinds.includes(kind);
}
