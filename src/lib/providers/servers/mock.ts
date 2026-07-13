import type { ServerProvider, Server, ServerStatus } from "./types";
import type { ProviderResult } from "@/lib/providers/result";

const mockServers: Server[] = [
  { id: "srv-web-01", name: "web-01", type: "cx22 · 2vCPU / 4GB", status: "running", ip: "203.0.113.10" },
  { id: "srv-db-01", name: "db-01", type: "cx32 · 4vCPU / 8GB", status: "running", ip: "203.0.113.11" },
  { id: "srv-worker-02", name: "worker-02", type: "cx22 · 2vCPU / 4GB", status: "stopped", ip: "203.0.113.12" },
];

const statusOverrides = new Map<string, ServerStatus>();
const pendingTransitions = new Map<string, { target: ServerStatus; at: number }>();

function resolveStatus(id: string, base: ServerStatus): ServerStatus {
  const pending = pendingTransitions.get(id);
  if (pending && Date.now() >= pending.at) {
    statusOverrides.set(id, pending.target);
    pendingTransitions.delete(id);
  }
  return statusOverrides.get(id) ?? base;
}

export class MockServerProvider implements ServerProvider {
  readonly id = "hetzner" as const;
  readonly mode = "mock" as const;

  async listServers(): Promise<ProviderResult<Server[]>> {
    const servers = mockServers.map((s) => ({ ...s, status: resolveStatus(s.id, s.status) }));
    return { ok: true, data: servers };
  }

  async getServer(id: string): Promise<ProviderResult<Server>> {
    const server = mockServers.find((s) => s.id === id);
    if (!server) return { ok: false, kind: "error", message: "Server not found" };
    return { ok: true, data: { ...server, status: resolveStatus(id, server.status) } };
  }

  async power(id: string, action: "start" | "stop" | "restart"): Promise<ProviderResult<void>> {
    const server = mockServers.find((s) => s.id === id);
    if (!server) return { ok: false, kind: "error", message: "Server not found" };

    const targets: Record<string, ServerStatus> = { start: "running", stop: "stopped", restart: "running" };
    const transitioning: Record<string, ServerStatus> = { start: "starting", stop: "stopping", restart: "stopping" };
    const delays: Record<string, number> = { start: 2000, stop: 2000, restart: 4000 };

    statusOverrides.set(id, transitioning[action]);
    pendingTransitions.set(id, { target: targets[action], at: Date.now() + delays[action] });
    return { ok: true, data: undefined };
  }
}
