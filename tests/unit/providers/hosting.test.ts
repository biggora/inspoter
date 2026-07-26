import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent } from "undici";
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

  it("passes an insecure undici Agent as the fetch dispatcher when allowInsecure is true", async () => {
    mockFetchOnce({
      metadata: { result: 1 },
      data: { acct: [] },
    });

    const provider = new CpanelWhmProvider(
      "cred-whm",
      "WHM",
      "srv.example.com",
      "root",
      "token",
      true,
    );
    await provider.listAccounts();

    const init = vi.mocked(fetch).mock.calls[0][1] as
      (RequestInit & { dispatcher?: unknown }) | undefined;
    expect(init?.dispatcher).toBeDefined();
    expect(init?.dispatcher).toBeInstanceOf(Agent);
  });

  it("does not pass a dispatcher when allowInsecure is false", async () => {
    mockFetchOnce({
      metadata: { result: 1 },
      data: { acct: [] },
    });

    const provider = new CpanelWhmProvider(
      "cred-whm",
      "WHM",
      "srv.example.com",
      "root",
      "token",
      false,
    );
    await provider.listAccounts();

    const init = vi.mocked(fetch).mock.calls[0][1] as
      (RequestInit & { dispatcher?: unknown }) | undefined;
    expect(init?.dispatcher).toBeUndefined();
  });
});

// The Hostinger listing fans out over a dozen endpoints, so its tests answer
// per path rather than with one payload. The first matching pattern wins, so
// the more specific route goes first; an unmatched path answers 404, which is
// exactly how a token without the relevant scope behaves.
function mockFetchByPath(routes: [string, unknown][]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const { pathname } = new URL(url);
      const match = routes.find(([pattern]) => pathname.includes(pattern));
      if (!match) {
        return { status: 404, ok: false, text: async () => "" };
      }
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify(match[1]),
      };
    }),
  );
}

const WEBSITES = "/api/hosting/v1/websites";

describe("HostingerProvider.listAccounts mapping", () => {
  it("joins websites against orders, databases, mail, PHP and WordPress", async () => {
    mockFetchByPath([
      [
        "/api/mail/v1/orders/OR1/mailboxes",
        { data: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] },
      ],
      [
        "/api/mail/v1/orders",
        { data: [{ id: "OR1", seats: 5, domain: { name: "main.com" } }] },
      ],
      [
        "/api/hosting/v1/accounts/u1/websites/main.com/php/details",
        { php_version: "8.3" },
      ],
      [
        "/api/hosting/v1/accounts/u1/websites/addon.com/php/details",
        { php_version: "8.1" },
      ],
      [
        "/api/hosting/v1/accounts/u1/wordpress/77/version",
        { version: "6.8.1" },
      ],
      [
        "/api/hosting/v1/accounts/u1/databases",
        {
          data: [
            { name: "db1", domain: "main.com", disk_usage_mb: 32 },
            { name: "db2", domain: "addon.com", disk_usage_mb: 16 },
            { name: "db3", domain: null, disk_usage_mb: 4 },
          ],
        },
      ],
      [
        "/api/hosting/v1/wordpress/installations",
        { data: [{ id: "77", username: "u1", domain: "main.com" }] },
      ],
      [
        "/api/hosting/v1/orders",
        {
          data: [
            {
              id: 12,
              subscription_id: "sub1",
              plan: { name: "hostinger_business" },
            },
          ],
        },
      ],
      [
        "/api/billing/v1/subscriptions",
        {
          data: [
            {
              id: "sub1",
              name: "Premium Web Hosting",
              expires_at: "2027-03-12T00:00:00Z",
            },
          ],
        },
      ],
      [
        WEBSITES,
        {
          data: [
            {
              domain: "main.com",
              vhost_type: "main",
              is_enabled: true,
              username: "u1",
              order_id: 12,
            },
            {
              domain: "addon.com",
              vhost_type: "addon",
              is_enabled: true,
              username: "u1",
              order_id: 12,
            },
          ],
        },
      ],
    ]);

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data[0]).toMatchObject({
      id: "main.com",
      domain: "main.com",
      user: "u1",
      // The subscription's marketing name beats the order's machine name.
      plan: "Premium Web Hosting",
      status: "active",
      // db1 plus the unassigned db3, which belongs to the account's main site.
      databases: 2,
      databaseDiskUsedMb: 36,
      emailAccounts: 3,
      emailAccountsLimit: 5,
      phpVersion: "8.3",
      wordpressVersion: "6.8.1",
      expiresAt: "2027-03-12T00:00:00Z",
      // Absent from the whole Hostinger specification for shared hosting.
      diskUsedMb: null,
      diskLimitMb: null,
      bandwidthUsedMb: null,
      ip: "",
      supportsSuspend: false,
    });

    expect(result.data[1]).toMatchObject({
      domain: "addon.com",
      plan: "Premium Web Hosting",
      databases: 1,
      databaseDiskUsedMb: 16,
      // No mail order and no WordPress installation for this domain.
      emailAccounts: null,
      emailAccountsLimit: null,
      phpVersion: "8.1",
      wordpressVersion: null,
    });
  });

  it("still lists websites when every enrichment call is unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (new URL(url).pathname.includes(WEBSITES)) {
          return {
            status: 200,
            ok: true,
            text: async () =>
              JSON.stringify({
                data: [
                  {
                    domain: "example.com",
                    vhost_type: "main",
                    is_enabled: true,
                    username: "u12345",
                    order_id: 12,
                  },
                ],
              }),
          };
        }
        return { status: 401, ok: false, text: async () => "" };
      }),
    );

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data[0]).toMatchObject({
      id: "example.com",
      user: "u12345",
      // Without the order the vhost type is the only truthful label left.
      plan: "main",
      status: "active",
      // A failed call is an unknown, never a zero.
      databases: null,
      databaseDiskUsedMb: null,
      emailAccounts: null,
      phpVersion: null,
      wordpressVersion: null,
      expiresAt: null,
    });
  });

  it("reports zero databases when the account genuinely has none", async () => {
    mockFetchByPath([
      ["/api/hosting/v1/accounts/u1/databases", { data: [] }],
      [
        WEBSITES,
        {
          data: [
            {
              domain: "empty.com",
              vhost_type: "main",
              is_enabled: true,
              username: "u1",
            },
          ],
        },
      ],
    ]);

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data[0]).toMatchObject({
      databases: 0,
      databaseDiskUsedMb: null,
    });
  });

  it("follows pagination past the first page of websites", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      domain: `site${i}.com`,
      vhost_type: "addon",
      is_enabled: true,
      username: "u1",
    }));
    const page2 = [
      {
        domain: "last.com",
        vhost_type: "addon",
        is_enabled: true,
        username: "u1",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        if (!parsed.pathname.includes(WEBSITES)) {
          return { status: 404, ok: false, text: async () => "" };
        }
        const page = parsed.searchParams.get("page");
        return {
          status: 200,
          ok: true,
          text: async () =>
            JSON.stringify({
              data: page === "1" ? page1 : page2,
              meta: { pagination: { total: 101 } },
            }),
        };
      }),
    );

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data).toHaveLength(101);
    expect(result.data[100]).toMatchObject({ domain: "last.com" });
  });

  it("maps is_enabled: false to a suspended status", async () => {
    mockFetchByPath([
      [
        WEBSITES,
        {
          data: [
            {
              domain: "disabled.com",
              vhost_type: "addon",
              is_enabled: false,
              username: "u1",
            },
          ],
        },
      ],
    ]);

    const provider = new HostingerProvider("cred-h", "Hostinger", "token");
    const result = await provider.listAccounts();
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data[0]).toMatchObject({
      status: "suspended",
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

  it("defaults allowInsecure to false for legacy credentials missing the field", async () => {
    getDecryptedCredentials.mockImplementation(async (_ws, type) => {
      if (type === "CPANEL_WHM") {
        return [
          {
            id: "c3",
            label: "WHM-legacy",
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
    expect(providers.map((p) => p.id)).toEqual(["c3"]);
  });
});
