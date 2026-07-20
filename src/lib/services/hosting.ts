import { getHostingProvidersForWorkspace } from "@/lib/providers/hosting";
import type {
  HostingAccount,
  HostingProvider,
} from "@/lib/providers/hosting/types";
import type { ProviderResult } from "@/lib/providers/result";

// Hosting service — aggregates all hosting-account providers with
// per-provider error isolation: a failing/unreachable provider never takes
// down the whole listing (mirrors services/servers.ts).

export interface AccountsByProvider {
  providerId: string;
  providerType: string;
  label: string;
  mode: string;
  accounts: HostingAccount[];
  error: string | null;
}

export async function listAccounts(
  workspaceId: string,
): Promise<AccountsByProvider[]> {
  const providers = await getHostingProvidersForWorkspace(workspaceId);
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listAccounts()),
  );

  return settled.map((result, index) => {
    const provider = providers[index];
    const base = {
      providerId: provider.id,
      providerType: provider.providerType,
      label: provider.label,
      mode: provider.mode,
    };
    if (result.status === "rejected") {
      return { ...base, accounts: [], error: String(result.reason) };
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      return {
        ...base,
        accounts: [],
        error:
          providerResult.kind === "error"
            ? providerResult.message
            : `Operation not supported: ${providerResult.operation}`,
      };
    }
    return { ...base, accounts: providerResult.data, error: null };
  });
}

async function findProvider(
  workspaceId: string,
  providerId: string,
): Promise<HostingProvider | null> {
  const providers = await getHostingProvidersForWorkspace(workspaceId);
  return providers.find((provider) => provider.id === providerId) ?? null;
}

function unknownProviderResult<T>(providerId: string): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: `Unknown hosting provider: ${providerId}`,
  };
}

export async function getAccount(
  workspaceId: string,
  providerId: string,
  id: string,
): Promise<ProviderResult<HostingAccount>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unknownProviderResult(providerId);
  return provider.getAccount(id);
}

export async function setSuspended(
  workspaceId: string,
  providerId: string,
  id: string,
  suspended: boolean,
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unknownProviderResult(providerId);
  return provider.setSuspended(id, suspended);
}
