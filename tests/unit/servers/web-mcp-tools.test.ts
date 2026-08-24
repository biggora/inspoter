import { describe, expect, it, vi } from "vitest";

import type { ProviderServerDto } from "@/components/servers/api";
import {
  createPowerActionTool,
  type PowerActionToolContext,
} from "@/components/servers/web-mcp-tools";
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

function makeCtx(
  overrides: Partial<PowerActionToolContext> = {},
): PowerActionToolContext {
  return {
    server,
    getAvailableActions: vi
      .fn()
      .mockReturnValue([
        { action: "restart", icon: "", labelKey: "", confirmTitleKey: "", confirmTextKey: "" },
        { action: "stop", icon: "", labelKey: "", confirmTitleKey: "", confirmTextKey: "" },
      ]),
    triggerPowerAction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createPowerActionTool", () => {
  it("calls triggerPowerAction and returns success when the action is available", async () => {
    const ctx = makeCtx();
    const tool = createPowerActionTool(ctx);

    const result = await tool.execute({ action: "stop" });

    expect(ctx.triggerPowerAction).toHaveBeenCalledWith(server, "stop");
    expect(expectToolJson(result)).toEqual({
      server: "web-prod-01",
      action: "stop",
      requested: true,
    });
  });

  it("does not call triggerPowerAction and flags isError when the action is unavailable", async () => {
    const ctx = makeCtx({
      getAvailableActions: vi
        .fn()
        .mockReturnValue([
          { action: "start", icon: "", labelKey: "", confirmTitleKey: "", confirmTextKey: "" },
        ]),
    });
    const tool = createPowerActionTool(ctx);

    const result = await tool.execute({ action: "stop" });
    const message = expectToolError(result);

    expect(ctx.triggerPowerAction).not.toHaveBeenCalled();
    expect(message).toContain("web-prod-01");
    expect(message).toContain("running");
    expect(message).toContain("start");
  });

  it("reports 'none' when no actions are available at all", async () => {
    const ctx = makeCtx({ getAvailableActions: vi.fn().mockReturnValue([]) });
    const tool = createPowerActionTool(ctx);

    const result = await tool.execute({ action: "start" });

    expect(ctx.triggerPowerAction).not.toHaveBeenCalled();
    expect(expectToolError(result)).toContain("none");
  });
});
