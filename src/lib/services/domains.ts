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

export interface DomainsByProvider {
  providerId: DnsProvider["id"];
  providerType: DnsProvider["providerType"];
  mode: DnsProvider["mode"];
  domains: Domain[];
  error: string | null;
}

export async function listDomains(
  workspaceId: string,
): Promise<DomainsByProvider[]> {
  const providers = await getDnsProvidersForWorkspace(workspaceId);
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listDomains()),
  );

  return settled.map((result, index) => {
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
      domains: providerResult.data,
      error: null,
    };
  });
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
