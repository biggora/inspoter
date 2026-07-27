import { getHostingProvidersForWorkspace } from "@/lib/providers/hosting";
import type {
  HostingAccount,
  HostingProvider,
} from "@/lib/providers/hosting/types";
import type { ProviderResult } from "@/lib/providers/result";
import { logError } from "@/lib/services/logs";
import { updateProviderHealth } from "./provider-health";

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

  const result = settled.map((result, index) => {
    const provider = providers[index];
    const base = {
      providerId: provider.id,
      providerType: provider.providerType,
      label: provider.label,
      mode: provider.mode,
    };
    if (result.status === "rejected") {
      logError(
        workspaceId,
        `provider:${provider.providerType.toLowerCase()}`,
        String(result.reason),
        JSON.stringify({
          operation: "listAccounts",
          credentialId: provider.id,
        }),
      );
      return { ...base, accounts: [], error: String(result.reason) };
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      const errorMsg =
        providerResult.kind === "error"
          ? providerResult.message
          : `Operation not supported: ${providerResult.operation}`;
      logError(
        workspaceId,
        `provider:${provider.providerType.toLowerCase()}`,
        errorMsg,
        JSON.stringify({
          operation: "listAccounts",
          credentialId: provider.id,
        }),
      );
      return {
        ...base,
        accounts: [],
        error: errorMsg,
      };
    }
    return { ...base, accounts: providerResult.data, error: null };
  });

  await Promise.all(
    result.map((r) =>
      updateProviderHealth(
        workspaceId,
        r.providerId,
        "Хостинг",
        r.providerType,
        r.error,
      ).catch((err) => {
        // Runs inside Promise.all alongside sibling providers — must not
        // reject, or one provider's health-write failure would take down
        // the whole listing.
        logError(
          workspaceId,
          "provider-health",
          String(err),
          JSON.stringify({
            operation: "updateProviderHealth",
            credentialId: r.providerId,
          }),
        );
      }),
    ),
  );

  return result;
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
  const result = await provider.getAccount(id);
  if (!result.ok) {
    logError(
      workspaceId,
      `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error"
        ? result.message
        : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "getAccount", accountId: id }),
    );
  }
  return result;
}

export async function setSuspended(
  workspaceId: string,
  providerId: string,
  id: string,
  suspended: boolean,
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unknownProviderResult(providerId);
  const result = await provider.setSuspended(id, suspended);
  if (!result.ok) {
    logError(
      workspaceId,
      `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error"
        ? result.message
        : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "setSuspended", accountId: id, suspended }),
    );
  }
  return result;
}
