import { getServerProviderForWorkspace } from "@/lib/providers/servers";
import type { Server } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";

export async function listServers(
  workspaceId: string,
): Promise<ProviderResult<Server[]>> {
  const provider = await getServerProviderForWorkspace(workspaceId);
  return provider.listServers();
}

export async function getServer(
  workspaceId: string,
  id: string,
): Promise<ProviderResult<Server>> {
  const provider = await getServerProviderForWorkspace(workspaceId);
  return provider.getServer(id);
}

export async function power(
  workspaceId: string,
  id: string,
  action: "start" | "stop" | "restart",
): Promise<ProviderResult<void>> {
  const provider = await getServerProviderForWorkspace(workspaceId);
  return provider.power(id, action);
}
