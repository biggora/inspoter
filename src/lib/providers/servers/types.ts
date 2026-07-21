import type { ProviderResult } from "@/lib/providers/result";

export type ServerStatus =
  "running" | "stopped" | "starting" | "stopping" | "restarting" | "unknown";

export interface Server {
  id: string;
  name: string;
  type: string;
  status: ServerStatus;
  ip: string;
  cpu: string;
  ram: string;
  disk: string;
  os: string;
  location: string;
}

export interface ServerProvider {
  readonly id: string;
  readonly providerType: string;
  readonly label: string;
  readonly mode: "real" | "mock";
  listServers(): Promise<ProviderResult<Server[]>>;
  listServersWithDeadline?(signal: AbortSignal): Promise<ProviderResult<Server[]>>;
  getServer(id: string): Promise<ProviderResult<Server>>;
  power(
    id: string,
    action: "start" | "stop" | "restart",
  ): Promise<ProviderResult<void>>;
}
