import { beforeEach, describe, expect, it, vi } from "vitest";
import * as domainsService from "@/lib/services/domains";
import { MockDnsProvider } from "@/lib/providers/dns/mock";

// Domains service (architecture.md §4.4, AC-DOM-*, AC-PROV-*) — mock
// providers use module-global in-memory state, no database involved.
// Production has no mock/env fallback (providers come only from workspace
// credentials), so the factory is mocked here to return the deterministic
// mock providers.

// `providers` overrides the default trio for the tests that need a specific
// credential set (two credentials of one provider, for instance).
const mockState = vi.hoisted(() => ({
  providers: null as unknown[] | null,
  logError: vi.fn(),
  recordSyncOutcomes: vi.fn(),
  providerSnapshotFindUnique: vi.fn(),
  providerSnapshotUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    providerSnapshot: {
      findUnique: mockState.providerSnapshotFindUnique,
      update: mockState.providerSnapshotUpdate,
    },
  },
}));

vi.mock("@/lib/services/logs", () => ({
  logError: mockState.logError,
}));

vi.mock("@/lib/services/provider-health", () => ({
  recordSyncOutcomes: mockState.recordSyncOutcomes,
}));

vi.mock("@/lib/providers/dns", async () => {
  const { MockDnsProvider } = await import("@/lib/providers/dns/mock");
  const defaults = [
    new MockDnsProvider("mock-cloudflare", "cloudflare", "Cloudflare Mock"),
    new MockDnsProvider("mock-hetzner", "hetzner", "Hetzner DNS Mock"),
    new MockDnsProvider("mock-godaddy", "godaddy", "GoDaddy Mock"),
  ];
  return {
    getDnsProvidersForWorkspace: async () => mockState.providers ?? defaults,
  };
});

// listDomains() reads the ProviderSnapshot cache rather than calling the
// providers directly. Swapping that cache for an in-memory one keeps these
// tests database-free while still exercising the whole fan-out: a workspace
// with no snapshot yet refreshes synchronously, which is every test here.
vi.mock("@/lib/services/provider-snapshots", async () => {
  const { createSnapshotsMemoryMock } =
    await import("./provider-snapshots-memory");
  const { getDnsProvidersForWorkspace } = await import("@/lib/providers/dns");
  return createSnapshotsMemoryMock(() => getDnsProvidersForWorkspace(""));
});

const WORKSPACE_ID = "test-workspace";

// Each test starts from a cold cache, so one test's zones can never leak into
// the next one's listing.
beforeEach(async () => {
  mockState.logError.mockReset();
  mockState.recordSyncOutcomes.mockReset().mockResolvedValue(undefined);
  mockState.providerSnapshotFindUnique.mockReset().mockResolvedValue(null);
  mockState.providerSnapshotUpdate.mockReset().mockResolvedValue(undefined);

  const snapshots = await import("@/lib/services/provider-snapshots");
  (snapshots as unknown as { __store: Map<string, unknown> }).__store.clear();
});

describe("listDomains()", () => {
  it("AC-DOM-002: returns deterministic mock domains grouped by provider with mode 'mock' and no error", async () => {
    const results = await domainsService.listDomains(WORKSPACE_ID);

    expect(results).toHaveLength(3);
    const byProvider = Object.fromEntries(
      results.map((r) => [r.providerId, r]),
    );

    expect(byProvider["mock-cloudflare"].mode).toBe("mock");
    expect(byProvider["mock-cloudflare"].error).toBeNull();
    expect(byProvider["mock-cloudflare"].domains.map((d) => d.id)).toEqual([
      "cf-example-com",
      "cf-example-dev",
    ]);

    expect(byProvider["mock-hetzner"].mode).toBe("mock");
    expect(byProvider["mock-hetzner"].error).toBeNull();
    expect(byProvider["mock-hetzner"].domains.map((d) => d.id)).toEqual([
      "hz-example-de",
      "hz-myserver-net",
    ]);

    expect(byProvider["mock-godaddy"].mode).toBe("mock");
    expect(byProvider["mock-godaddy"].error).toBeNull();
    expect(byProvider["mock-godaddy"].domains.map((d) => d.id)).toEqual([
      "gd-mysite-com",
      "gd-shop-io",
      "gd-blog-app",
    ]);
  });

  it("AC-DOM-003/N-1: isolates a provider that throws so healthy providers still return data", async () => {
    const spy = vi
      .spyOn(MockDnsProvider.prototype, "listDomains")
      .mockRejectedValueOnce(new Error("network unreachable"));

    const results = await domainsService.listDomains(WORKSPACE_ID);
    spy.mockRestore();

    const byProvider = Object.fromEntries(
      results.map((r) => [r.providerId, r]),
    );

    expect(byProvider["mock-cloudflare"]).toEqual({
      providerId: "mock-cloudflare",
      providerType: "cloudflare",
      mode: "mock",
      domains: [],
      error: "Error: network unreachable",
    });
    expect(byProvider["mock-hetzner"].error).toBeNull();
    expect(byProvider["mock-hetzner"].domains.length).toBeGreaterThan(0);
    expect(byProvider["mock-godaddy"].error).toBeNull();
    expect(byProvider["mock-godaddy"].domains.length).toBeGreaterThan(0);
  });

  it("maps a provider ok:false 'error' result to a providerId-scoped error message", async () => {
    const spy = vi
      .spyOn(MockDnsProvider.prototype, "listDomains")
      .mockResolvedValueOnce({
        ok: false,
        kind: "error",
        message: "auth failed",
      });

    const results = await domainsService.listDomains(WORKSPACE_ID);
    spy.mockRestore();

    const cloudflareResult = results.find(
      (r) => r.providerId === "mock-cloudflare",
    );
    expect(cloudflareResult).toEqual({
      providerId: "mock-cloudflare",
      providerType: "cloudflare",
      mode: "mock",
      domains: [],
      error: "auth failed",
    });
  });

  it("AC-PROV-003: maps a provider ok:false 'unsupported' result to an 'Operation not supported' message", async () => {
    const spy = vi
      .spyOn(MockDnsProvider.prototype, "listDomains")
      .mockResolvedValueOnce({
        ok: false,
        kind: "unsupported",
        operation: "listDomains",
      });

    const results = await domainsService.listDomains(WORKSPACE_ID);
    spy.mockRestore();

    const cloudflareResult = results.find(
      (r) => r.providerId === "mock-cloudflare",
    );
    expect(cloudflareResult?.error).toBe(
      "Operation not supported: listDomains",
    );
    expect(cloudflareResult?.domains).toEqual([]);
    expect(mockState.recordSyncOutcomes).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "dns",
      "listDomains",
      expect.arrayContaining([
        {
          credentialId: "mock-cloudflare",
          providerType: "cloudflare",
          error: "Operation not supported: listDomains",
        },
      ]),
    );
  });
});

describe("listDomains() record counts", () => {
  it("counts each zone's records, matching what listRecords returns", async () => {
    const results = await domainsService.listDomains(WORKSPACE_ID);

    for (const provider of results) {
      for (const domain of provider.domains) {
        const records = await domainsService.listRecords(
          WORKSPACE_ID,
          provider.providerId,
          domain.id,
        );
        if (!records.ok) throw new Error("expected ok result");
        expect(domain.recordCount).toBe(records.data.length);
      }
    }
  });

  it("degrades a zone whose records cannot be read to a null count, not an error", async () => {
    const spy = vi
      .spyOn(MockDnsProvider.prototype, "listRecords")
      .mockRejectedValue(new Error("network unreachable"));

    const results = await domainsService.listDomains(WORKSPACE_ID);
    spy.mockRestore();

    const domains = results.flatMap((provider) => provider.domains);
    expect(domains.length).toBeGreaterThan(0);
    expect(domains.every((domain) => domain.recordCount === null)).toBe(true);
    expect(results.every((provider) => provider.error === null)).toBe(true);
  });
});

describe("listDomains() duplicate zones", () => {
  it("keeps one row per zone when two credentials of one provider expose it", async () => {
    mockState.providers = [
      new MockDnsProvider("mock-cloudflare", "cloudflare", "Cloudflare Mock"),
      new MockDnsProvider(
        "mock-cloudflare-second",
        "cloudflare",
        "Second Cloudflare",
      ),
      new MockDnsProvider("mock-godaddy", "godaddy", "GoDaddy Mock"),
    ];

    try {
      const results = await domainsService.listDomains(WORKSPACE_ID);
      const byProvider = Object.fromEntries(
        results.map((r) => [r.providerId, r]),
      );

      // The zone survives in the credential that listed it first, and says how
      // many other credentials also hold it.
      const example = byProvider["mock-cloudflare"].domains.find(
        (d) => d.name === "example.com",
      );
      expect(example?.duplicateCredentialCount).toBe(1);
      expect(byProvider["mock-cloudflare-second"].domains).toEqual([]);
      expect(
        results
          .flatMap((provider) => provider.domains)
          .filter((domain) => domain.name === "example.com"),
      ).toHaveLength(1);
    } finally {
      mockState.providers = null;
    }
  });

  it("keeps the same domain listed by two different providers as two zones", async () => {
    const godaddy = new MockDnsProvider(
      "mock-godaddy",
      "godaddy",
      "GoDaddy Mock",
    );
    vi.spyOn(godaddy, "listDomains").mockResolvedValue({
      ok: true,
      data: [
        { id: "gd-example-com", name: "example.com", provider: "godaddy" },
      ],
    });
    mockState.providers = [
      new MockDnsProvider("mock-cloudflare", "cloudflare", "Cloudflare Mock"),
      godaddy,
    ];

    try {
      const results = await domainsService.listDomains(WORKSPACE_ID);
      const shared = results
        .flatMap((provider) => provider.domains)
        .filter((domain) => domain.name === "example.com");

      // Nothing collapses across provider types: mid-migration a domain
      // legitimately lives in two DNS services, each managed on its own.
      expect(shared).toHaveLength(2);
      expect(shared.every((d) => d.duplicateCredentialCount === 0)).toBe(true);
    } finally {
      mockState.providers = null;
    }
  });
});

describe("unknown provider handling", () => {
  it("listRecords returns an error result for an unknown provider id", async () => {
    const result = await domainsService.listRecords(
      WORKSPACE_ID,
      "unknown-provider",
      "any-domain",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown DNS provider: unknown-provider",
    });
  });

  it("createRecord returns an error result for an unknown provider id", async () => {
    const result = await domainsService.createRecord(
      WORKSPACE_ID,
      "unknown-provider",
      "any-domain",
      { type: "A", name: "@", value: "1.2.3.4", ttl: 60 },
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown DNS provider: unknown-provider",
    });
  });

  it("updateRecord returns an error result for an unknown provider id", async () => {
    const result = await domainsService.updateRecord(
      WORKSPACE_ID,
      "unknown-provider",
      "any-domain",
      "any-record",
      { ttl: 60 },
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown DNS provider: unknown-provider",
    });
  });

  it("deleteRecord returns an error result for an unknown provider id", async () => {
    const result = await domainsService.deleteRecord(
      WORKSPACE_ID,
      "unknown-provider",
      "any-domain",
      "any-record",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown DNS provider: unknown-provider",
    });
  });
});

describe("listRecords()", () => {
  it("AC-DOM-004: returns records with type, name, value, and ttl for a known domain", async () => {
    const result = await domainsService.listRecords(
      WORKSPACE_ID,
      "mock-cloudflare",
      "cf-example-com",
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data).toEqual([
      { id: "cf-rec-1", type: "A", name: "@", value: "192.0.2.10", ttl: 3600 },
      {
        id: "cf-rec-2",
        type: "CNAME",
        name: "www",
        value: "example.com",
        ttl: 3600,
      },
      {
        id: "cf-rec-3",
        type: "TXT",
        name: "@",
        value: "v=spf1 -all",
        ttl: 3600,
      },
    ]);
  });

  it("returns 'Domain not found' for a domain id that does not exist under the provider", async () => {
    const result = await domainsService.listRecords(
      WORKSPACE_ID,
      "mock-cloudflare",
      "does-not-exist",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Domain not found",
    });
  });
});

describe("createRecord()", () => {
  it("AC-DOM-005: creates a record and it appears in the domain's record list", async () => {
    const input = { type: "A", name: "api", value: "192.0.2.99", ttl: 120 };
    const created = await domainsService.createRecord(
      WORKSPACE_ID,
      "mock-cloudflare",
      "cf-example-dev",
      input,
    );
    if (!created.ok) throw new Error("expected ok result");

    expect(created.data.id).toMatch(/^mock-cloudflare-mock-rec-\d+$/);
    expect(created.data).toMatchObject(input);

    const listed = await domainsService.listRecords(
      WORKSPACE_ID,
      "mock-cloudflare",
      "cf-example-dev",
    );
    if (!listed.ok) throw new Error("expected ok result");

    expect(listed.data).toHaveLength(2);
    expect(listed.data.some((r) => r.id === created.data.id)).toBe(true);
  });

  it("returns 'Domain not found' when creating a record under an unknown domain", async () => {
    const result = await domainsService.createRecord(
      WORKSPACE_ID,
      "mock-cloudflare",
      "does-not-exist",
      { type: "A", name: "x", value: "1.2.3.4", ttl: 60 },
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Domain not found",
    });
  });
});

describe("updateRecord()", () => {
  it("AC-DOM-006: updates value and ttl of an existing record", async () => {
    const result = await domainsService.updateRecord(
      WORKSPACE_ID,
      "mock-hetzner",
      "hz-example-de",
      "hz-rec-1",
      { value: "203.0.113.250", ttl: 900 },
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data).toMatchObject({
      id: "hz-rec-1",
      value: "203.0.113.250",
      ttl: 900,
    });
  });

  it("leaves fields not included in the patch unchanged", async () => {
    const before = await domainsService.listRecords(
      WORKSPACE_ID,
      "mock-hetzner",
      "hz-example-de",
    );
    if (!before.ok) throw new Error("expected ok result");
    const mxRecord = before.data.find((r) => r.id === "hz-rec-2");
    expect(mxRecord).toBeDefined();

    const result = await domainsService.updateRecord(
      WORKSPACE_ID,
      "mock-hetzner",
      "hz-example-de",
      "hz-rec-2",
      { ttl: 1800 },
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data.value).toBe(mxRecord?.value);
    expect(result.data.ttl).toBe(1800);
  });

  it("returns 'Record not found' for an unknown record id under a known domain", async () => {
    const result = await domainsService.updateRecord(
      WORKSPACE_ID,
      "mock-hetzner",
      "hz-myserver-net",
      "does-not-exist",
      { ttl: 300 },
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Record not found",
    });
  });

  it("returns 'Record not found' for an unknown domain id (mock provider does not distinguish missing domain from missing record on update)", async () => {
    const result = await domainsService.updateRecord(
      WORKSPACE_ID,
      "mock-hetzner",
      "does-not-exist",
      "hz-rec-1",
      { ttl: 300 },
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Record not found",
    });
  });
});

describe("deleteRecord()", () => {
  it("AC-DOM-007: removes a record so it no longer appears in the domain's record list", async () => {
    const result = await domainsService.deleteRecord(
      WORKSPACE_ID,
      "mock-godaddy",
      "gd-shop-io",
      "gd-rec-3",
    );
    expect(result).toEqual({ ok: true, data: undefined });

    const listed = await domainsService.listRecords(
      WORKSPACE_ID,
      "mock-godaddy",
      "gd-shop-io",
    );
    if (!listed.ok) throw new Error("expected ok result");
    expect(listed.data).toHaveLength(0);
  });

  it("returns 'Record not found' for an unknown record id under a known domain", async () => {
    const result = await domainsService.deleteRecord(
      WORKSPACE_ID,
      "mock-godaddy",
      "gd-blog-app",
      "does-not-exist",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Record not found",
    });
  });

  it("returns 'Domain not found' for an unknown domain id", async () => {
    const result = await domainsService.deleteRecord(
      WORKSPACE_ID,
      "mock-godaddy",
      "does-not-exist",
      "gd-rec-4",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Domain not found",
    });
  });
});
