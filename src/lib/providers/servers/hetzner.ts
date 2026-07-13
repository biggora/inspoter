import type { ServerProvider, Server } from "./types";
import type { ProviderResult } from "@/lib/providers/result";

function unsupported<T>(operation: string): ProviderResult<T> {
  return { ok: false, kind: "unsupported", operation };
}

export class HetznerServerProvider implements ServerProvider {
  readonly id = "hetzner" as const;
  readonly mode = "real" as const;

  async listServers(): Promise<ProviderResult<Server[]>> {
    return unsupported("listServers");
  }

  async getServer(_id: string): Promise<ProviderResult<Server>> {
    return unsupported("getServer");
  }

  async power(
    _id: string,
    _action: "start" | "stop" | "restart",
  ): Promise<ProviderResult<void>> {
    return unsupported("power");
  }
}
