import { createProviderHttpClient } from "@/lib/providers/http";
import type { ServerProvider, Server, ServerStatus } from "./types";
import type { ProviderResult } from "@/lib/providers/result";

const BASE_URL = "https://api.hetzner.cloud/v1";
const PER_PAGE = 50;
const MAX_PAGES = 100;

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
  meta?: { pagination?: { next_page: number | null } };
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
  readonly id: string;
  readonly providerType = "hetzner";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(id: string, label: string, apiToken: string) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }

  private async fetchAllServers(
    signal?: AbortSignal,
  ): Promise<ProviderResult<Server[]>> {
    const servers: Server[] = [];
    let page = 1;

    for (let i = 0; i < MAX_PAGES; i++) {
      const result = await this.client.request<HetznerServerListResponse>({
        path: `/servers?per_page=${PER_PAGE}&page=${page}`,
        signal,
      });
      if (!result.ok) return result;
      servers.push(...result.data.servers.map(toServer));

      const nextPage = result.data.meta?.pagination?.next_page;
      if (!nextPage) break;
      page = nextPage;
    }

    return { ok: true, data: servers };
  }

  async listServers(): Promise<ProviderResult<Server[]>> {
    return this.fetchAllServers();
  }

  async listServersWithDeadline(
    signal: AbortSignal,
  ): Promise<ProviderResult<Server[]>> {
    const result = await this.fetchAllServers(signal);
    if (!result.ok && signal.aborted) {
      return {
        ok: false,
        kind: "error",
        message: "Server discovery deadline exceeded",
      };
    }
    return result;
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
