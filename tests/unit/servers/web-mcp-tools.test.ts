import { describe, expect, it, vi } from "vitest";

import type {
  AgentOnlyServerDto,
  ProviderServerDto,
  ServerMetricsDto,
} from "@/components/servers/api";
import {
  createServersTools,
  type ServersToolDeps,
} from "@/components/servers/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const server: ProviderServerDto = {
  localServerId: "server-1",
  origin: "provider",
  providerCredentialId: "cred-1",
  providerId: "provider-1",
  remoteServerId: "remote-1",
  providerAvailability: "present",
  powerActionsAvailable: true,
  metrics: {
    state: "not_configured",
    receivedAt: null,
    cpuUsagePercent: null,
    load1: null,
    load5: null,
    load15: null,
    memoryTotalBytes: null,
    memoryAvailableBytes: null,
    swapTotalBytes: null,
    swapFreeBytes: null,
    filesystemTotalBytes: null,
    filesystemAvailableBytes: null,
    uptimeSeconds: null,
  },
  name: "web-prod-01",
  type: "cx22",
  status: "running",
  ip: "203.0.113.1",
  cpu: "2 vCPU",
  ram: "4 GB",
  disk: "40 GB",
  os: "Ubuntu 24.04",
  location: "Helsinki",
};

const liveMetrics: ServerMetricsDto = {
  state: "live",
  receivedAt: "2026-01-01T00:00:00.000Z",
  cpuUsagePercent: 37.4,
  load1: 0.42,
  load5: 0.31,
  load15: 0.25,
  memoryTotalBytes: "8000000000",
  memoryAvailableBytes: "2000000000",
  swapTotalBytes: "2000000000",
  swapFreeBytes: "1500000000",
  filesystemTotalBytes: "40000000000",
  filesystemAvailableBytes: "10000000000",
  uptimeSeconds: "864000",
};

function makeProviderServer(
  overrides: Partial<ProviderServerDto> = {},
): ProviderServerDto {
  return { ...server, metrics: liveMetrics, ...overrides };
}

function makeAgentServer(
  overrides: Partial<AgentOnlyServerDto> = {},
): AgentOnlyServerDto {
  return {
    localServerId: "server-agent",
    origin: "agent",
    providerCredentialId: null,
    providerId: null,
    remoteServerId: null,
    providerAvailability: "not_applicable",
    powerActionsAvailable: false,
    metrics: server.metrics,
    name: "build-runner",
    hostname: "runner.internal",
    ...overrides,
  };
}

const inventory = [
  makeProviderServer(),
  makeProviderServer({
    localServerId: "server-2",
    name: "db-prod-01",
    type: "ccx33",
    ip: "203.0.113.9",
    os: "Debian 12",
    location: "Nuremberg",
  }),
  makeAgentServer(),
];

function makeDeps(overrides: Partial<ServersToolDeps> = {}): ServersToolDeps {
  return {
    fetchServers: vi
      .fn()
      .mockResolvedValue({ servers: inventory, providerErrors: [] }),
    getServerByLocalId: vi.fn().mockResolvedValue(makeProviderServer()),
    refreshServers: vi
      .fn()
      .mockResolvedValue({ servers: inventory, providerErrors: [] }),
    powerAction: vi.fn().mockResolvedValue({ ok: true }),
    refresh: vi.fn(),
    ...overrides,
  };
}

function byName(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

describe("createServersTools — catalog", () => {
  it("exposes servers_list, server_get, servers_refresh and server_power_action", () => {
    expect(createServersTools(makeDeps()).map((tool) => tool.name)).toEqual([
      "servers_list",
      "server_get",
      "servers_refresh",
      "server_power_action",
    ]);
  });

  it("gives every tool a non-empty title for clients that caption it", () => {
    for (const tool of createServersTools(makeDeps())) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
    }
  });

  it("marks the two reads readOnly and the two writes not", () => {
    const tools = createServersTools(makeDeps());

    expect(
      tools.map((tool) => [tool.name, tool.annotations.readOnlyHint]),
    ).toEqual([
      ["servers_list", true],
      ["server_get", true],
      ["servers_refresh", false],
      ["server_power_action", false],
    ]);
  });

  it("flags every result as untrusted — OS and provider strings are third-party", () => {
    for (const tool of createServersTools(makeDeps())) {
      expect(tool.annotations.untrustedContentHint, tool.name).toBe(true);
    }
  });
});

describe("servers_list", () => {
  function listTool(deps = makeDeps()) {
    return { tool: byName(createServersTools(deps), "servers_list"), deps };
  }

  it("returns a compact row per server with a metrics summary", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      total: number;
      matched: number;
      servers: Record<string, unknown>[];
    }>(await tool.execute({}));

    expect(payload.total).toBe(3);
    expect(payload.matched).toBe(3);
    expect(payload.servers[0]).toEqual({
      localServerId: "server-1",
      name: "web-prod-01",
      origin: "provider",
      metrics: {
        state: "live",
        receivedAt: "2026-01-01T00:00:00.000Z",
        cpuPercent: 37,
        memoryPercent: 75,
        diskPercent: 75,
      },
      status: "running",
      ip: "203.0.113.1",
      location: "Helsinki",
    });
  });

  it("summarizes metrics rather than passing the raw byte counts through", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      servers: { metrics: Record<string, unknown> }[];
    }>(await tool.execute({}));

    expect(Object.keys(payload.servers[0].metrics)).toEqual([
      "state",
      "receivedAt",
      "cpuPercent",
      "memoryPercent",
      "diskPercent",
    ]);
  });

  it("reports nulls rather than NaN when no agent has reported", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      servers: { localServerId: string; metrics: Record<string, unknown> }[];
    }>(await tool.execute({ query: "runner" }));

    expect(payload.servers[0].metrics).toEqual({
      state: "not_configured",
      receivedAt: null,
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
    });
  });

  // One case per field the in-process haystack joins, matching
  // src/lib/mcp/tools/servers.ts: provider servers match on
  // name/ip/os/location/type, agent-only servers on name/hostname.
  it.each([
    ["provider name", "db-prod", "server-2"],
    ["ip", "203.0.113.9", "server-2"],
    ["os", "debian", "server-2"],
    ["location", "nuremberg", "server-2"],
    ["type", "ccx33", "server-2"],
    ["agent name", "build-runner", "server-agent"],
    ["agent hostname", "runner.internal", "server-agent"],
  ])("matches the query against %s", async (_field, query, expectedId) => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      matched: number;
      servers: { localServerId: string }[];
    }>(await tool.execute({ query }));

    expect(payload.matched).toBe(1);
    expect(payload.servers[0].localServerId).toBe(expectedId);
  });

  it("matches case-insensitively", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{ matched: number }>(
      await tool.execute({ query: "HELSINKI" }),
    );

    expect(payload.matched).toBe(1);
  });

  it("does not match an agent-only server on a provider-only field", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      servers: { localServerId: string }[];
    }>(await tool.execute({ query: "ubuntu" }));

    expect(payload.servers.map((entry) => entry.localServerId)).toEqual([
      "server-1",
    ]);
  });

  it("caps the rows at the limit while still reporting the match count", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      matched: number;
      servers: unknown[];
    }>(await tool.execute({ limit: 1 }));

    expect(payload.matched).toBe(3);
    expect(payload.servers).toHaveLength(1);
  });

  it("passes the per-provider errors through", async () => {
    const { tool } = listTool(
      makeDeps({
        fetchServers: vi.fn().mockResolvedValue({
          servers: [],
          providerErrors: [
            { providerId: "hetzner", label: "Hetzner", error: "401" },
          ],
        }),
      }),
    );

    const payload = await expectToolJson<{
      providerErrors: unknown[];
    }>(await tool.execute({}));

    expect(payload.providerErrors).toEqual([
      { providerId: "hetzner", error: "401" },
    ]);
  });

  it("surfaces a rejecting fetch as an error result", async () => {
    const { tool } = listTool(
      makeDeps({
        fetchServers: vi
          .fn()
          .mockRejectedValue(new Error("Failed to fetch servers")),
      }),
    );

    expect(expectToolError(await tool.execute({}))).toBe(
      "Failed to fetch servers",
    );
  });
});

describe("server_get", () => {
  it("returns the hardware summary plus load and swap, but no sample arrays", async () => {
    const deps = makeDeps();
    const tool = byName(createServersTools(deps), "server_get");

    const payload = await expectToolJson<{
      metrics: Record<string, unknown>;
      cpu: string;
    }>(await tool.execute({ localServerId: "server-1" }));

    expect(deps.getServerByLocalId).toHaveBeenCalledWith("server-1");
    expect(payload.cpu).toBe("2 vCPU");
    expect(payload.metrics).toEqual({
      state: "live",
      receivedAt: "2026-01-01T00:00:00.000Z",
      cpuPercent: 37,
      memoryPercent: 75,
      diskPercent: 75,
      load1: 0.42,
      load5: 0.31,
      load15: 0.25,
      swapPercent: 25,
      uptimeSeconds: "864000",
    });
  });

  it("returns hostname instead of the provider fields for an agent-only server", async () => {
    const deps = makeDeps({
      getServerByLocalId: vi.fn().mockResolvedValue(makeAgentServer()),
    });
    const tool = byName(createServersTools(deps), "server_get");

    const payload = await expectToolJson<Record<string, unknown>>(
      await tool.execute({ localServerId: "server-agent" }),
    );

    expect(payload.hostname).toBe("runner.internal");
    expect(payload).not.toHaveProperty("ip");
    expect(payload).not.toHaveProperty("providerId");
  });

  it("surfaces a missing server as an error result", async () => {
    const deps = makeDeps({
      getServerByLocalId: vi
        .fn()
        .mockRejectedValue(new Error("Server not found")),
    });
    const tool = byName(createServersTools(deps), "server_get");

    expect(expectToolError(await tool.execute({ localServerId: "gone" }))).toBe(
      "Server not found",
    );
  });
});

describe("servers_refresh", () => {
  it("fans out to the providers and refreshes the visible list", async () => {
    const deps = makeDeps();
    const tool = byName(createServersTools(deps), "servers_refresh");

    const payload = await expectToolJson(await tool.execute({}));

    expect(deps.refreshServers).toHaveBeenCalledTimes(1);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({ servers: 3, providerErrors: [] });
  });

  it("does not refresh the UI when the fan-out fails", async () => {
    const deps = makeDeps({
      refreshServers: vi
        .fn()
        .mockRejectedValue(new Error("Failed to refresh servers")),
    });
    const tool = byName(createServersTools(deps), "servers_refresh");

    expect(expectToolError(await tool.execute({}))).toBe(
      "Failed to refresh servers",
    );
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("server_power_action", () => {
  function powerTool(deps = makeDeps()) {
    return {
      tool: byName(createServersTools(deps), "server_power_action"),
      deps,
    };
  }

  it("sends the action to the owning provider and refreshes the UI", async () => {
    const { tool, deps } = powerTool();

    const payload = await expectToolJson(
      await tool.execute({ localServerId: "server-1", action: "stop" }),
    );

    expect(deps.getServerByLocalId).toHaveBeenCalledWith("server-1");
    // The power route is addressed by provider + remote id, not the local one.
    expect(deps.powerAction).toHaveBeenCalledWith(
      "provider-1",
      "remote-1",
      "stop",
    );
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      localServerId: "server-1",
      server: "web-prod-01",
      action: "stop",
      requested: true,
    });
  });

  it("refuses an action the current status does not allow, naming the ones that are", async () => {
    const { tool, deps } = powerTool(
      makeDeps({
        getServerByLocalId: vi
          .fn()
          .mockResolvedValue(makeProviderServer({ status: "stopped" })),
      }),
    );

    const message = expectToolError(
      await tool.execute({ localServerId: "server-1", action: "stop" }),
    );

    expect(deps.powerAction).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(message).toContain("web-prod-01");
    expect(message).toContain("stopped");
    expect(message).toContain("start");
  });

  it("refuses an agent-only server, which has no provider to act through", async () => {
    const { tool, deps } = powerTool(
      makeDeps({
        getServerByLocalId: vi.fn().mockResolvedValue(makeAgentServer()),
      }),
    );

    const message = expectToolError(
      await tool.execute({ localServerId: "server-agent", action: "start" }),
    );

    expect(deps.powerAction).not.toHaveBeenCalled();
    expect(message).toContain("build-runner");
    expect(message).toContain("agent-only");
  });

  it("does not refresh the UI when the provider rejects the action", async () => {
    const { tool, deps } = powerTool(
      makeDeps({
        powerAction: vi
          .fn()
          .mockRejectedValue(new Error("Power action failed")),
      }),
    );

    expect(
      expectToolError(
        await tool.execute({ localServerId: "server-1", action: "restart" }),
      ),
    ).toBe("Power action failed");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
