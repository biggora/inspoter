import { getHostingProvidersForWorkspace } from "@/lib/providers/hosting";
import type {
  HostingAccount,
  HostingProvider,
} from "@/lib/providers/hosting/types";
import type { ProviderResult } from "@/lib/providers/result";
import { logError } from "@/lib/services/logs";
import * as snapshots from "@/lib/services/provider-snapshots";
import { recordSyncOutcomes, type SyncOutcome } from "./provider-health";

// Hosting service — aggregates all hosting-account providers with
// per-provider error isolation: a failing/unreachable provider never takes
// down the whole listing (mirrors services/servers.ts).
//
// The fan-out runs in refreshHostingSnapshots() and is cached in
// ProviderSnapshot (ADR-004 amendment). That matters most here: Hostinger's
// listAccounts() expands into a per-site sweep for PHP versions and WordPress
// installs, which is far too expensive to repeat on every page visit.

const KIND = "HOSTING_ACCOUNTS" as const;

export interface AccountsByProvider {
  providerId: string;
  providerType: string;
  label: string;
  mode: string;
  accounts: HostingAccount[];
  error: string | null;
}

/**
 * Fans out to the hosting providers and persists one snapshot per credential.
 * `credentialIds` narrows the pass; omitted, every hosting credential in the
 * workspace is refreshed.
 */
export async function refreshHostingSnapshots(
  workspaceId: string,
  credentialIds?: string[],
): Promise<void> {
  const all = await getHostingProvidersForWorkspace(workspaceId);
  const wanted = credentialIds ? new Set(credentialIds) : null;
  const providers = wanted
    ? all.filter((provider) => wanted.has(provider.id))
    : all;
  if (providers.length === 0) return;

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listAccounts()),
  );

  const groups: AccountsByProvider[] = settled.map((result, index) => {
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
  await recordSyncOutcomes(workspaceId, "hosting", "listAccounts", outcomes);
}

export async function listAccounts(
  workspaceId: string,
): Promise<AccountsByProvider[]> {
  const rows = await snapshots.readCachedListing(
    workspaceId,
    KIND,
    refreshHostingSnapshots,
  );
  return rows.map((row) => row.payload as AccountsByProvider);
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
  } else {
    // The cached card still shows the old suspension state and there is no
    // way to derive the new one — let the next read refetch this credential.
    await snapshots.markStale(providerId, KIND);
  }
  return result;
}
