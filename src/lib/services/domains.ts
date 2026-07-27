import { getDnsProvidersForWorkspace } from "@/lib/providers/dns";
import type {
  Domain,
  DnsProvider,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";
import { db } from "@/lib/db";
import { logError } from "@/lib/services/logs";
import * as snapshots from "@/lib/services/provider-snapshots";
import { recordSyncOutcomes, type SyncOutcome } from "./provider-health";

// Domains service (architecture.md §4.4) — aggregates all DNS providers with
// per-provider error isolation: a failing/unreachable provider never takes
// down the whole listing (AC-DOM-003, N-1).
//
// The provider fan-out runs in refreshDnsSnapshots() and its result is cached
// in ProviderSnapshot (ADR-004 amendment); listDomains() reads that cache, so
// opening the section costs a couple of indexed queries instead of one
// provider call per credential plus one per zone.

const KIND = "DNS_ZONES" as const;

export interface DomainWithRecordCount extends Domain {
  /** null when this zone's record listing failed — the row shows a dash. */
  recordCount: number | null;
  /**
   * How many further credentials of the same provider expose this same zone.
   * 0 in the ordinary case. The listing keeps one row per zone, and this count
   * is what the row shows so the collapse is never silent: only one of those
   * accounts is the authoritative one, and DNS edits go to the credential of
   * the row that survived.
   */
  duplicateCredentialCount: number;
}

export interface DomainsByProvider {
  providerId: DnsProvider["id"];
  providerType: DnsProvider["providerType"];
  mode: DnsProvider["mode"];
  domains: DomainWithRecordCount[];
  error: string | null;
}

// No DNS provider exposes a bulk "records per zone" endpoint, so the count
// costs one listRecords call per domain. They run in parallel, and a zone
// whose records can't be read degrades to `null` on its own row rather than
// failing the whole provider (same isolation rule as listDomains itself).
// This is the N+1 the snapshot cache exists to keep off the render path.
async function withRecordCounts(
  provider: DnsProvider,
  domains: Domain[],
): Promise<DomainWithRecordCount[]> {
  return Promise.all(
    domains.map(async (domain) => {
      const result = await provider.listRecords(domain.id).catch(() => null);
      return {
        ...domain,
        recordCount: result?.ok ? result.data.length : null,
        duplicateCredentialCount: 0,
      };
    }),
  );
}

// Two credentials of one DNS provider can expose the same zone — a second token
// for the same account, or two accounts that both hold the domain — and the
// listing would then show it twice, with no way to tell which row's records an
// edit reaches. One row per zone survives, in the first credential that listed
// it, and it carries the number of further credentials so the operator can see
// there is more than one place to look.
//
// Identity is provider type plus zone name. It deliberately stops at the
// provider boundary: the same domain in Cloudflare and in GoDaddy is two
// separate zones an operator manages separately — typically mid-migration —
// and collapsing those would hide one of them outright.
//
// Runs on read, not on refresh: it spans every credential at once, while a
// snapshot only ever holds one credential's zones.
function dedupeZones(groups: DomainsByProvider[]): DomainsByProvider[] {
  const firstRowByZone = new Map<string, DomainWithRecordCount>();

  return groups.map((group) => ({
    ...group,
    domains: group.domains.filter((domain) => {
      const zone = `${group.providerType}:${domain.name.trim().toLowerCase().replace(/\.$/, "")}`;
      const kept = firstRowByZone.get(zone);
      if (!kept) {
        firstRowByZone.set(zone, domain);
        return true;
      }
      kept.duplicateCredentialCount += 1;
      return false;
    }),
  }));
}

async function fetchGroup(
  provider: DnsProvider,
  result: PromiseSettledResult<ProviderResult<Domain[]>>,
): Promise<DomainsByProvider> {
  const base = {
    providerId: provider.id,
    providerType: provider.providerType,
    mode: provider.mode,
  };
  if (result.status === "rejected") {
    return { ...base, domains: [], error: String(result.reason) };
  }
  const providerResult = result.value;
  if (!providerResult.ok) {
    return {
      ...base,
      domains: [],
      error:
        providerResult.kind === "error"
          ? providerResult.message
          : `Operation not supported: ${providerResult.operation}`,
    };
  }
  return {
    ...base,
    domains: await withRecordCounts(provider, providerResult.data),
    error: null,
  };
}

/**
 * Fans out to the DNS providers and persists one snapshot per credential.
 * Called by the background scheduler, by the manual-refresh route, and by
 * listDomains() for credentials that have no snapshot yet.
 *
 * `credentialIds` narrows the pass to specific credentials; omitted, every
 * DNS credential in the workspace is refreshed.
 */
export async function refreshDnsSnapshots(
  workspaceId: string,
  credentialIds?: string[],
): Promise<void> {
  const all = await getDnsProvidersForWorkspace(workspaceId);
  const wanted = credentialIds ? new Set(credentialIds) : null;
  const providers = wanted
    ? all.filter((provider) => wanted.has(provider.id))
    : all;
  if (providers.length === 0) return;

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listDomains()),
  );

  const groups = await Promise.all(
    settled.map((result, index) => fetchGroup(providers[index], result)),
  );

  await Promise.all(
    groups.map((group) =>
      snapshots.writeSnapshot(
        workspaceId,
        group.providerId,
        KIND,
        group,
        group.error,
      ),
    ),
  );

  const outcomes: SyncOutcome[] = groups.map((group) => ({
    credentialId: group.providerId,
    providerType: group.providerType,
    error: group.error,
  }));
  await recordSyncOutcomes(workspaceId, "DNS", "listDomains", outcomes);
}

export async function listDomains(
  workspaceId: string,
): Promise<DomainsByProvider[]> {
  const rows = await snapshots.readCachedListing(
    workspaceId,
    KIND,
    refreshDnsSnapshots,
  );
  // duplicateCredentialCount is stored as 0 and recomputed here, because
  // dedupeZones mutates the rows it keeps.
  const groups = rows.map((row) => row.payload as DomainsByProvider);
  return dedupeZones(groups);
}

// A create or delete shifts the zone's cached record count by exactly one, so
// the listing can be corrected without going back to the provider. If the
// arithmetic ever drifts, the next background refresh overwrites it.
async function shiftCachedRecordCount(
  workspaceId: string,
  credentialId: string,
  domainId: string,
  delta: number,
): Promise<void> {
  try {
    const row = await db.providerSnapshot.findUnique({
      where: { credentialId_kind: { credentialId, kind: KIND } },
      select: { workspaceId: true, payload: true },
    });
    if (!row || row.workspaceId !== workspaceId) return;

    const group = row.payload as unknown as DomainsByProvider;
    const domain = group.domains?.find((entry) => entry.id === domainId);
    if (!domain || domain.recordCount === null) return;

    domain.recordCount = Math.max(0, domain.recordCount + delta);
    await db.providerSnapshot.update({
      where: { credentialId_kind: { credentialId, kind: KIND } },
      data: { payload: group as never },
    });
  } catch {
    // The count is cosmetic and self-healing; never fail the DNS edit for it.
  }
}

async function findProvider(
  workspaceId: string,
  providerId: string,
): Promise<DnsProvider | null> {
  const providers = await getDnsProvidersForWorkspace(workspaceId);
  return providers.find((provider) => provider.id === providerId) ?? null;
}

function unsupportedProviderResult<T>(providerId: string): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: `Unknown DNS provider: ${providerId}`,
  };
}

// Deliberately uncached: this is the authoritative editing view for one zone,
// it costs a single call, and stale records here would be dangerous.
export async function listRecords(
  workspaceId: string,
  providerId: string,
  domainId: string,
): Promise<ProviderResult<DnsRecord[]>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.listRecords(domainId);
}

export async function createRecord(
  workspaceId: string,
  providerId: string,
  domainId: string,
  input: DnsRecordInput,
): Promise<ProviderResult<DnsRecord>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  const result = await provider.createRecord(domainId, input);
  if (!result.ok) {
    logError(workspaceId, `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error" ? result.message : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "createRecord", domainId }));
  } else {
    await shiftCachedRecordCount(workspaceId, providerId, domainId, 1);
  }
  return result;
}

export async function updateRecord(
  workspaceId: string,
  providerId: string,
  domainId: string,
  recordId: string,
  input: DnsRecordPatch,
): Promise<ProviderResult<DnsRecord>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  const result = await provider.updateRecord(domainId, recordId, input);
  if (!result.ok) {
    logError(workspaceId, `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error" ? result.message : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "updateRecord", domainId, recordId }));
  }
  // An edit changes a record's contents, never how many there are — the
  // cached count stays correct.
  return result;
}

export async function deleteRecord(
  workspaceId: string,
  providerId: string,
  domainId: string,
  recordId: string,
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  const result = await provider.deleteRecord(domainId, recordId);
  if (!result.ok) {
    logError(workspaceId, `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error" ? result.message : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "deleteRecord", domainId, recordId }));
  } else {
    await shiftCachedRecordCount(workspaceId, providerId, domainId, -1);
  }
  return result;
}
