import { getDnsProvidersForWorkspace } from "@/lib/providers/dns";
import type {
  Domain,
  DnsProvider,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

// Domains service (architecture.md §4.4) — aggregates all DNS providers with
// per-provider error isolation: a failing/unreachable provider never takes
// down the whole listing (AC-DOM-003, N-1).

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

export async function listDomains(
  workspaceId: string,
): Promise<DomainsByProvider[]> {
  const providers = await getDnsProvidersForWorkspace(workspaceId);
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listDomains()),
  );

  const groups = await Promise.all(
    settled.map(async (result, index) => {
      const provider = providers[index];
      if (result.status === "rejected") {
        return {
          providerId: provider.id,
          providerType: provider.providerType,
          mode: provider.mode,
          domains: [],
          error: String(result.reason),
        };
      }
      const providerResult = result.value;
      if (!providerResult.ok) {
        return {
          providerId: provider.id,
          providerType: provider.providerType,
          mode: provider.mode,
          domains: [],
          error:
            providerResult.kind === "error"
              ? providerResult.message
              : `Operation not supported: ${providerResult.operation}`,
        };
      }
      return {
        providerId: provider.id,
        providerType: provider.providerType,
        mode: provider.mode,
        domains: await withRecordCounts(provider, providerResult.data),
        error: null,
      };
    }),
  );

  return dedupeZones(groups);
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
  return provider.createRecord(domainId, input);
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
  return provider.updateRecord(domainId, recordId, input);
}

export async function deleteRecord(
  workspaceId: string,
  providerId: string,
  domainId: string,
  recordId: string,
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.deleteRecord(domainId, recordId);
}
