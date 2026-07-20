import { describe, expect, it, vi } from "vitest";
import * as domainsService from "@/lib/services/domains";
import { MockDnsProvider } from "@/lib/providers/dns/mock";

// Domains service (architecture.md §4.4, AC-DOM-*, AC-PROV-*) — mock
// providers use module-global in-memory state, no database involved.
// Production has no mock/env fallback (providers come only from workspace
// credentials), so the factory is mocked here to return the deterministic
// mock providers.

vi.mock("@/lib/providers/dns", async () => {
  const { MockDnsProvider } = await import("@/lib/providers/dns/mock");
  return {
    getDnsProvidersForWorkspace: async () => [
      new MockDnsProvider("mock-cloudflare", "cloudflare", "Cloudflare Mock"),
      new MockDnsProvider("mock-hetzner", "hetzner", "Hetzner DNS Mock"),
      new MockDnsProvider("mock-godaddy", "godaddy", "GoDaddy Mock"),
    ],
  };
});

const WORKSPACE_ID = "test-workspace";

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
