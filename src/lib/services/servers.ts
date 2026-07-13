import { getServerProvider } from "@/lib/providers/servers";
import type { Server } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";

export async function listServers(): Promise<ProviderResult<Server[]>> {
  return getServerProvider().listServers();
}

export async function getServer(id: string): Promise<ProviderResult<Server>> {
  return getServerProvider().getServer(id);
}

export async function power(
  id: string,
  action: "start" | "stop" | "restart",
): Promise<ProviderResult<void>> {
  return getServerProvider().power(id, action);
}
