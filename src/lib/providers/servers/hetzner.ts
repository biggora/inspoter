import { createProviderHttpClient } from "@/lib/providers/http";
import type { ServerProvider, Server, ServerStatus } from "./types";
import type { ProviderResult } from "@/lib/providers/result";

const BASE_URL = "https://api.hetzner.cloud/v1";

interface HetznerServerType {
  cores: number;
  memory: number;
  disk: number;
  description: string;
}

interface HetznerServer {
  id: number;
  name: string;
  server_type: HetznerServerType;
  status: string;
  public_net: { ipv4: { ip: string } | null };
  datacenter: { name: string };
  image: { description: string } | null;
}

interface HetznerServerListResponse {
  servers: HetznerServer[];
}

interface HetznerServerResponse {
  server: HetznerServer;
}

interface HetznerAction {
  id: number;
  status: string;
}

interface HetznerActionResponse {
  action: HetznerAction;
}

const STATUS_MAP: Record<string, ServerStatus> = {
  running: "running",
  off: "stopped",
  starting: "starting",
  stopping: "stopping",
};

function toServerStatus(status: string): ServerStatus {
  return STATUS_MAP[status] ?? "unknown";
}

function toServer(server: HetznerServer): Server {
  return {
    id: String(server.id),
    name: server.name,
    type: server.server_type?.description ?? "",
    status: toServerStatus(server.status),
    ip: server.public_net?.ipv4?.ip ?? "",
    cpu: `${server.server_type?.cores ?? "?"} vCPU`,
    ram: `${server.server_type?.memory ?? "?"} GB`,
    disk: `${server.server_type?.disk ?? "?"} GB`,
    os: server.image?.description ?? "Unknown",
    location: server.datacenter?.name ?? "",
  };
}

const POWER_ACTION_PATHS: Record<"start" | "stop" | "restart", string> = {
  start: "poweron",
  stop: "poweroff",
  restart: "reboot",
};

export class HetznerServerProvider implements ServerProvider {
  readonly id = "hetzner" as const;
  readonly mode = "real" as const;
  private readonly client;

  constructor(apiToken: string) {
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }

  async listServers(): Promise<ProviderResult<Server[]>> {
    const result = await this.client.request<HetznerServerListResponse>({
      path: "/servers",
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.servers.map(toServer) };
  }

  async getServer(id: string): Promise<ProviderResult<Server>> {
    const result = await this.client.request<HetznerServerResponse>({
      path: `/servers/${id}`,
    });
    if (!result.ok) return result;
    return { ok: true, data: toServer(result.data.server) };
  }

  async power(
    id: string,
    action: "start" | "stop" | "restart",
  ): Promise<ProviderResult<void>> {
    const result = await this.client.request<HetznerActionResponse>({
      method: "POST",
      path: `/servers/${id}/actions/${POWER_ACTION_PATHS[action]}`,
    });
    if (!result.ok) return result;
    return { ok: true, data: undefined };
  }
}
