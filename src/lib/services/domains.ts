import { getDnsProviders } from "@/lib/providers/dns";
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

export interface DomainsByProvider {
  providerId: DnsProvider["id"];
  mode: DnsProvider["mode"];
  domains: Domain[];
  error: string | null;
}

export async function listDomains(): Promise<DomainsByProvider[]> {
  const providers = getDnsProviders();
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listDomains()),
  );

  return settled.map((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      return {
        providerId: provider.id,
        mode: provider.mode,
        domains: [],
        error: String(result.reason),
      };
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      return {
        providerId: provider.id,
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
      mode: provider.mode,
      domains: providerResult.data,
      error: null,
    };
  });
}

function findProvider(providerId: string): DnsProvider | null {
  return (
    getDnsProviders().find((provider) => provider.id === providerId) ?? null
  );
}

function unsupportedProviderResult<T>(providerId: string): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: `Unknown DNS provider: ${providerId}`,
  };
}

export async function listRecords(
  providerId: string,
  domainId: string,
): Promise<ProviderResult<DnsRecord[]>> {
  const provider = findProvider(providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.listRecords(domainId);
}

export async function createRecord(
  providerId: string,
  domainId: string,
  input: DnsRecordInput,
): Promise<ProviderResult<DnsRecord>> {
  const provider = findProvider(providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.createRecord(domainId, input);
}

export async function updateRecord(
  providerId: string,
  domainId: string,
  recordId: string,
  input: DnsRecordPatch,
): Promise<ProviderResult<DnsRecord>> {
  const provider = findProvider(providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.updateRecord(domainId, recordId, input);
}

export async function deleteRecord(
  providerId: string,
  domainId: string,
  recordId: string,
): Promise<ProviderResult<void>> {
  const provider = findProvider(providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.deleteRecord(domainId, recordId);
}
