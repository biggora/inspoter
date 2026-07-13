import type { ServerProvider, Server, ServerStatus } from "./types";
import type { ProviderResult } from "@/lib/providers/result";

const mockServers: Server[] = [
  {
    id: "srv-01",
    name: "web-prod-01",
    type: "cx41 · 4vCPU / 16GB",
    status: "running",
    cpu: "4 vCPU (AMD EPYC)",
    ram: "16 GB",
    disk: "160 GB NVMe",
    ip: "49.12.34.56",
    location: "Nuremberg, DE",
    os: "Ubuntu 24.04 LTS",
  },
  {
    id: "srv-02",
    name: "web-prod-02",
    type: "cx41 · 4vCPU / 16GB",
    status: "running",
    cpu: "4 vCPU (AMD EPYC)",
    ram: "16 GB",
    disk: "160 GB NVMe",
    ip: "49.12.34.78",
    location: "Falkenstein, DE",
    os: "Ubuntu 24.04 LTS",
  },
  {
    id: "srv-03",
    name: "db-primary",
    type: "cx51 · 8vCPU / 32GB",
    status: "running",
    cpu: "8 vCPU (Intel Xeon)",
    ram: "32 GB",
    disk: "320 GB NVMe",
    ip: "78.46.12.34",
    location: "Nuremberg, DE",
    os: "Debian 12",
  },
  {
    id: "srv-04",
    name: "db-replica",
    type: "cx51 · 8vCPU / 32GB",
    status: "stopped",
    cpu: "8 vCPU (Intel Xeon)",
    ram: "32 GB",
    disk: "320 GB NVMe",
    ip: "78.46.12.56",
    location: "Helsinki, FI",
    os: "Debian 12",
  },
  {
    id: "srv-05",
    name: "cache-node",
    type: "cx21 · 2vCPU / 8GB",
    status: "running",
    cpu: "2 vCPU (AMD EPYC)",
    ram: "8 GB",
    disk: "80 GB NVMe",
    ip: "116.203.45.67",
    location: "Nuremberg, DE",
    os: "Ubuntu 24.04 LTS",
  },
  {
    id: "srv-06",
    name: "dev-staging",
    type: "cx21 · 2vCPU / 8GB",
    status: "stopped",
    cpu: "2 vCPU (AMD EPYC)",
    ram: "8 GB",
    disk: "80 GB NVMe",
    ip: "116.203.45.89",
    location: "Falkenstein, DE",
    os: "Ubuntu 24.04 LTS",
  },
];

const statusOverrides = new Map<string, ServerStatus>();
const pendingTransitions = new Map<
  string,
  { target: ServerStatus; at: number }
>();

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
    const servers = mockServers.map((s) => ({
      ...s,
      status: resolveStatus(s.id, s.status),
    }));
    return { ok: true, data: servers };
  }

  async getServer(id: string): Promise<ProviderResult<Server>> {
    const server = mockServers.find((s) => s.id === id);
    if (!server)
      return { ok: false, kind: "error", message: "Server not found" };
    return {
      ok: true,
      data: { ...server, status: resolveStatus(id, server.status) },
    };
  }

  async power(
    id: string,
    action: "start" | "stop" | "restart",
  ): Promise<ProviderResult<void>> {
    const server = mockServers.find((s) => s.id === id);
    if (!server)
      return { ok: false, kind: "error", message: "Server not found" };

    const targets: Record<string, ServerStatus> = {
      start: "running",
      stop: "stopped",
      restart: "running",
    };
    const transitioning: Record<string, ServerStatus> = {
      start: "starting",
      stop: "stopping",
      restart: "restarting",
    };
    const delays: Record<string, number> = {
      start: 2000,
      stop: 2000,
      restart: 4000,
    };

    statusOverrides.set(id, transitioning[action]);
    pendingTransitions.set(id, {
      target: targets[action],
      at: Date.now() + delays[action],
    });
    return { ok: true, data: undefined };
  }
}
