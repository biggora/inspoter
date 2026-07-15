import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import type { Server, ServerProvider } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";

// Servers service — aggregates all hosting providers with per-provider
// error isolation: a failing/unreachable provider never takes down the
// whole listing (mirrors domains.ts).

export interface ServersByProvider {
  providerId: string;
  providerType: string;
  label: string;
  mode: string;
  servers: Server[];
  error: string | null;
}

export async function listServers(
  workspaceId: string,
): Promise<ServersByProvider[]> {
  const providers = await getServerProvidersForWorkspace(workspaceId);
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listServers()),
  );

  return settled.map((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      return {
        providerId: provider.id,
        providerType: provider.providerType,
        label: provider.label,
        mode: provider.mode,
        servers: [],
        error: String(result.reason),
      };
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      return {
        providerId: provider.id,
        providerType: provider.providerType,
        label: provider.label,
        mode: provider.mode,
        servers: [],
        error:
          providerResult.kind === "error"
            ? providerResult.message
            : `Operation not supported: ${providerResult.operation}`,
      };
    }
    return {
      providerId: provider.id,
      providerType: provider.providerType,
      label: provider.label,
      mode: provider.mode,
      servers: providerResult.data,
      error: null,
    };
  });
}

async function findProvider(
  workspaceId: string,
  providerId: string,
): Promise<ServerProvider | null> {
  const providers = await getServerProvidersForWorkspace(workspaceId);
  return providers.find((provider) => provider.id === providerId) ?? null;
}

function unsupportedProviderResult<T>(providerId: string): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: `Unknown server provider: ${providerId}`,
  };
}

export async function getServer(
  workspaceId: string,
  providerId: string,
  id: string,
): Promise<ProviderResult<Server>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.getServer(id);
}

export async function power(
  workspaceId: string,
  providerId: string,
  id: string,
  action: "start" | "stop" | "restart",
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  return provider.power(id, action);
}
