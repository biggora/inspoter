import { describe, expect, it, vi } from "vitest";
import * as hostingService from "@/lib/services/hosting";

// Hosting service aggregation with per-provider error isolation. The provider
// factory is mocked to return the deterministic mock hosting provider.

vi.mock("@/lib/providers/hosting", async () => {
  const { MockHostingProvider } = await import("@/lib/providers/hosting/mock");
  return {
    getHostingProvidersForWorkspace: async () => [
      new MockHostingProvider("mock-hosting", "cpanel-whm", "cPanel Mock"),
    ],
  };
});

const WORKSPACE_ID = "test-workspace";
const PROVIDER_ID = "mock-hosting";

describe("listAccounts()", () => {
  it("returns deterministic mock accounts grouped by provider", async () => {
    const result = await hostingService.listAccounts(WORKSPACE_ID);
    expect(result).toHaveLength(1);

    const [group] = result;
    expect(group.providerId).toBe(PROVIDER_ID);
    expect(group.error).toBeNull();
    expect(group.accounts.map((a) => a.id)).toEqual(["acme", "blogco"]);
    expect(group.accounts[0]).toMatchObject({
      domain: "acme.example.com",
      status: "active",
      supportsSuspend: true,
    });
  });
});

describe("getAccount()", () => {
  it("returns a single account by id", async () => {
    const result = await hostingService.getAccount(
      WORKSPACE_ID,
      PROVIDER_ID,
      "blogco",
    );
    if (!result.ok) throw new Error("expected ok result");
    expect(result.data).toMatchObject({ id: "blogco", status: "suspended" });
  });

  it("returns an error for an unknown providerId", async () => {
    const result = await hostingService.getAccount(
      WORKSPACE_ID,
      "unknown",
      "acme",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown hosting provider: unknown",
    });
  });
});

describe("setSuspended()", () => {
  it("suspends then unsuspends an account, reflecting the new status", async () => {
    const suspend = await hostingService.setSuspended(
      WORKSPACE_ID,
      PROVIDER_ID,
      "acme",
      true,
    );
    expect(suspend).toEqual({ ok: true, data: undefined });

    const suspended = await hostingService.getAccount(
      WORKSPACE_ID,
      PROVIDER_ID,
      "acme",
    );
    if (!suspended.ok) throw new Error("expected ok result");
    expect(suspended.data.status).toBe("suspended");

    await hostingService.setSuspended(WORKSPACE_ID, PROVIDER_ID, "acme", false);
    const active = await hostingService.getAccount(
      WORKSPACE_ID,
      PROVIDER_ID,
      "acme",
    );
    if (!active.ok) throw new Error("expected ok result");
    expect(active.data.status).toBe("active");
  });
});
