import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCpanelBaseUrl,
  parseCpanelCount,
  parseCpanelMb,
} from "@/lib/providers/hosting/cpanel";
import { CpanelWhmProvider } from "@/lib/providers/hosting/cpanel-whm";
import { HostingerProvider } from "@/lib/providers/hosting/hostinger";
import { getHostingProvidersForWorkspace } from "@/lib/providers/hosting";
import * as credentialsService from "@/lib/services/credentials";

vi.mock("@/lib/services/credentials", () => ({
  getDecryptedCredentials: vi.fn(async () => []),
}));

const getDecryptedCredentials = vi.mocked(
  credentialsService.getDecryptedCredentials,
);

function mockFetchOnce(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(payload),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  getDecryptedCredentials.mockReset();
  getDecryptedCredentials.mockResolvedValue([]);
});

describe("cPanel helpers", () => {
  it("buildCpanelBaseUrl normalizes host, host:port and full URLs", () => {
    expect(buildCpanelBaseUrl("srv.example.com", 2087)).toBe(
      "https://srv.example.com:2087",
    );
    expect(buildCpanelBaseUrl("srv.example.com:2087", 2087)).toBe(
      "https://srv.example.com:2087",
    );
    expect(buildCpanelBaseUrl("https://srv.example.com/", 2083)).toBe(
      "https://srv.example.com:2083",
    );
  });

  it("parseCpanelMb returns null for unlimited/unknown and numbers otherwise", () => {
    expect(parseCpanelMb("unlimited")).toBeNull();
    expect(parseCpanelMb("∞")).toBeNull();
    expect(parseCpanelMb(null)).toBeNull();
    expect(parseCpanelMb("1024")).toBe(1024);
    expect(parseCpanelMb("512M")).toBe(512);
  });

  it("parseCpanelCount parses integers and treats unlimited as null", () => {
    expect(parseCpanelCount("5")).toBe(5);
    expect(parseCpanelCount("unlimited")).toBeNull();
    expect(parseCpanelCount(null)).toBeNull();
  });
});

describe("CpanelWhmProvider.listAccounts mapping", () => {
  it("maps WHM listaccts rows to normalized suspendable accounts", async () => {
    mockFetchOnce({
      metadata: { result: 1 },
      data: {
        acct: [
          {
            user: "acme",
            domain: "acme.com",
            plan: "business",
            ip: "203.0.113.5",
            suspended: 0,
            disklimit: "10240",
            diskused: "2048",
          },
          {
            user: "beta",
            domain: "beta.io",
            suspended: 1,
            disklimit: "unlimited",
            diskused: "512",
          },
        ],
      },
    });

    const provider = new CpanelWhmProvider(
      "cred-whm",
      "WHM",
      "srv.example.com",
      "root",
      "token",
    );
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: "acme",
      domain: "acme.com",
      status: "active",
      diskUsedMb: 2048,
      diskLimitMb: 10240,
      supportsSuspend: true,
    });
    expect(result.data[1]).toMatchObject({
      status: "suspended",
      diskLimitMb: null,
    });
  });
});

describe("HostingerProvider.listAccounts mapping", () => {
  it("maps portfolio domains and keeps usage metrics null", async () => {
    mockFetchOnce([
      { id: 1, domain: "example.com", status: "active", type: "domain" },
    ]);

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data[0]).toMatchObject({
      id: "1",
      domain: "example.com",
      status: "active",
      diskUsedMb: null,
      supportsSuspend: false,
    });
  });
});

describe("getHostingProvidersForWorkspace()", () => {
  it("returns an empty list without credentials", async () => {
    const providers = await getHostingProvidersForWorkspace("ws");
    expect(providers).toEqual([]);
  });

  it("builds Hostinger and cPanel providers from credentials", async () => {
    getDecryptedCredentials.mockImplementation(async (_ws, type) => {
      if (type === "HOSTINGER") {
        return [
          { id: "c1", label: "H", type: "HOSTINGER", apiToken: "t" },
        ] as never;
      }
      if (type === "CPANEL_WHM") {
        return [
          {
            id: "c2",
            label: "WHM",
            type: "CPANEL_WHM",
            hostname: "srv",
            username: "root",
            apiToken: "t",
          },
        ] as never;
      }
      return [] as never;
    });

    const providers = await getHostingProvidersForWorkspace("ws");
    expect(providers.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(providers.map((p) => p.providerType)).toEqual([
      "hostinger",
      "cpanel-whm",
    ]);
  });
});
