import type { ProviderResult } from "@/lib/providers/result";

export type ServerStatus =
  "running" | "stopped" | "starting" | "stopping" | "unknown";

export interface Server {
  id: string;
  name: string;
  type: string;
  status: ServerStatus;
  ip: string;
}

export interface ServerProvider {
  readonly id: "hetzner";
  readonly mode: "real" | "mock";
  listServers(): Promise<ProviderResult<Server[]>>;
  getServer(id: string): Promise<ProviderResult<Server>>;
  power(
    id: string,
    action: "start" | "stop" | "restart",
  ): Promise<ProviderResult<void>>;
}
