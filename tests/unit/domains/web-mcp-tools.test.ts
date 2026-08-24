import { describe, expect, it, vi } from "vitest";

import {
  createDomainsTools,
  type DomainsToolDeps,
} from "@/components/domains/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { DnsRecord } from "@/lib/providers/dns/types";
import type { DomainsByProvider } from "@/lib/services/domains";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

// Exercises every DNS tool through the full WebMcpTool.execute() path with the
// client api injected as vi.fn() deps. The mutations are the point: each one
// reaches a live registrar, so the ids it forwards have to be exactly the ones
// the agent named.

function makeRecord(overrides: Partial<DnsRecord> = {}): DnsRecord {
  return {
    id: "rec-1",
    type: "A",
    name: "www",
    value: "203.0.113.10",
    ttl: 3600,
    ...overrides,
  };
}

function makeGroups(): DomainsByProvider[] {
  return [
    {
      providerId: "prov-cf",
      providerType: "cloudflare",
      mode: "real",
      error: null,
      domains: [
        {
          id: "zone-1",
          name: "example.com",
          provider: "cloudflare",
          recordCount: 12,
          duplicateCredentialCount: 0,
        },
        {
          id: "zone-2",
          name: "example.dev",
          provider: "cloudflare",
          recordCount: null,
          duplicateCredentialCount: 0,
        },
      ],
    },
    {
      providerId: "prov-gd",
      providerType: "godaddy",
      mode: "real",
      error: "Credential rejected.",
      domains: [],
    },
  ];
}

function makeDeps(overrides: Partial<DomainsToolDeps> = {}): DomainsToolDeps {
  return {
    fetchDomains: vi.fn().mockResolvedValue(makeGroups()),
    fetchRecords: vi.fn().mockResolvedValue([makeRecord()]),
    createRecord: vi
      .fn()
      .mockImplementation(async (_p, _d, data) =>
        makeRecord({ id: "rec-new", ...data }),
      ),
    updateRecord: vi
      .fn()
      .mockImplementation(async (_p, _d, recordId, data) =>
        makeRecord({ id: recordId, ...data }),
      ),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    ...overrides,
  };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

const EXPECTED_NAMES = [
  "domains_list",
  "dns_records_list",
  "dns_record_create",
  "dns_record_update",
  "dns_record_delete",
];

describe("createDomainsTools", () => {
  it("exposes exactly the expected tool names", () => {
    expect(createDomainsTools(makeDeps()).map((tool) => tool.name)).toEqual(
      EXPECTED_NAMES,
    );
  });

  it("gives every tool a non-empty title for clients that caption tools", () => {
    for (const tool of createDomainsTools(makeDeps())) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("marks only the two listings read-only, and both untrusted", () => {
    const tools = createDomainsTools(makeDeps());

    expect(
      tools
        .filter((tool) => tool.annotations.readOnlyHint)
        .map((tool) => tool.name),
    ).toEqual(["domains_list", "dns_records_list"]);
    expect(
      tools
        .filter((tool) => tool.annotations.untrustedContentHint)
        .map((tool) => tool.name),
    ).toEqual(["domains_list", "dns_records_list"]);
  });

  it("says in every mutation's description that the write reaches the live provider", () => {
    const tools = createDomainsTools(makeDeps()).filter(
      (tool) => !tool.annotations.readOnlyHint,
    );

    for (const tool of tools) {
      expect(tool.description).toContain("live");
    }
  });

  it("requires both providerId and domainId on every DNS tool but domains_list", () => {
    for (const tool of createDomainsTools(makeDeps())) {
      const required =
        (tool.inputSchema as { required?: string[] }).required ?? [];
      if (tool.name === "domains_list") {
        expect(required).toEqual([]);
        continue;
      }
      expect(required).toContain("providerId");
      expect(required).toContain("domainId");
    }
  });
});

describe("domains_list", () => {
  it("flattens provider→domain so each row carries both ids and both names", async () => {
    const result = await toolNamed(
      createDomainsTools(makeDeps()),
      "domains_list",
    ).execute({});

    expect(expectToolJson(result)).toEqual({
      total: 2,
      domains: [
        {
          providerId: "prov-cf",
          providerName: "cloudflare",
          domainId: "zone-1",
          domainName: "example.com",
          recordCount: 12,
        },
        {
          providerId: "prov-cf",
          providerName: "cloudflare",
          domainId: "zone-2",
          domainName: "example.dev",
          recordCount: null,
        },
      ],
      providerErrors: [
        {
          providerId: "prov-gd",
          providerName: "godaddy",
          error: "Credential rejected.",
        },
      ],
    });
  });

  it("caps the rows at the requested limit while reporting the true total", async () => {
    const result = await toolNamed(
      createDomainsTools(makeDeps()),
      "domains_list",
    ).execute({ limit: 1 });

    const payload = expectToolJson<{ total: number; domains: unknown[] }>(
      result,
    );
    expect(payload.total).toBe(2);
    expect(payload.domains).toHaveLength(1);
  });

  it("surfaces a rejecting api call as an error result", async () => {
    const deps = makeDeps({
      fetchDomains: vi.fn().mockRejectedValue(new Error("Snapshot missing.")),
    });
    const result = await toolNamed(
      createDomainsTools(deps),
      "domains_list",
    ).execute({});

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Snapshot missing.");
  });
});

describe("dns_records_list", () => {
  it("passes providerId and domainId through in order", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_records_list",
    ).execute({ providerId: "prov-cf", domainId: "zone-1" });

    expect(deps.fetchRecords).toHaveBeenCalledWith("prov-cf", "zone-1");
    expect(expectToolJson(result)).toEqual({
      total: 1,
      records: [
        {
          id: "rec-1",
          type: "A",
          name: "www",
          value: "203.0.113.10",
          ttl: 3600,
        },
      ],
    });
  });

  it("trims a long record value to keep the result small", async () => {
    const deps = makeDeps({
      fetchRecords: vi
        .fn()
        .mockResolvedValue([
          makeRecord({ type: "TXT", value: "x".repeat(400) }),
        ]),
    });
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_records_list",
    ).execute({ providerId: "prov-cf", domainId: "zone-1" });

    const { records } = expectToolJson<{ records: { value: string }[] }>(
      result,
    );
    expect(records[0].value).toHaveLength(121);
    expect(records[0].value.endsWith("…")).toBe(true);
  });

  it("refuses a call that omits the provider", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_records_list",
    ).execute({ domainId: "zone-1" });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.fetchRecords).not.toHaveBeenCalled();
  });
});

describe("dns_record_create", () => {
  it("forwards provider, domain and the record payload, then refreshes", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_create",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      type: "MX",
      name: "@",
      value: "mail.example.com",
      ttl: 3600,
      priority: 10,
    });

    expect(deps.createRecord).toHaveBeenCalledWith("prov-cf", "zone-1", {
      type: "MX",
      name: "@",
      value: "mail.example.com",
      ttl: 3600,
      priority: 10,
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toMatchObject({
      recordId: "rec-new",
      domainId: "zone-1",
      providerId: "prov-cf",
    });
  });

  it("omits priority entirely when it was not given", async () => {
    const deps = makeDeps();
    await toolNamed(createDomainsTools(deps), "dns_record_create").execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      type: "A",
      name: "www",
      value: "203.0.113.10",
      ttl: 300,
    });

    expect(deps.createRecord).toHaveBeenCalledWith("prov-cf", "zone-1", {
      type: "A",
      name: "www",
      value: "203.0.113.10",
      ttl: 300,
    });
  });

  it("rejects a record type the app does not support", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_create",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      type: "CAA",
      name: "@",
      value: '0 issue "letsencrypt.org"',
      ttl: 3600,
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createRecord).not.toHaveBeenCalled();
  });

  it("rejects a non-positive ttl", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_create",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      type: "A",
      name: "www",
      value: "203.0.113.10",
      ttl: 0,
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createRecord).not.toHaveBeenCalled();
  });
});

describe("dns_record_update", () => {
  it("forwards provider, domain and record ids with only the changed fields", async () => {
    const deps = makeDeps();
    await toolNamed(createDomainsTools(deps), "dns_record_update").execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
      ttl: 120,
    });

    expect(deps.updateRecord).toHaveBeenCalledWith(
      "prov-cf",
      "zone-1",
      "rec-1",
      { ttl: 120 },
    );
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("refuses an ids-only call rather than issuing an empty patch", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_update",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
    });

    expect(expectToolError(result)).toBe(
      "Pass at least one of value, ttl or priority.",
    );
    expect(deps.updateRecord).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("does not accept a type or name change", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_update",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
      type: "CNAME",
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.updateRecord).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting provider call as an error result", async () => {
    const deps = makeDeps({
      updateRecord: vi
        .fn()
        .mockRejectedValue(new Error("Provider rejected the record.")),
    });
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_update",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
      value: "203.0.113.11",
    });

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Provider rejected the record.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("dns_record_delete", () => {
  it("forwards all three ids and refreshes", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_delete",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
    });

    expect(deps.deleteRecord).toHaveBeenCalledWith(
      "prov-cf",
      "zone-1",
      "rec-1",
    );
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      recordId: "rec-1",
      domainId: "zone-1",
      providerId: "prov-cf",
      deleted: true,
    });
  });

  it("surfaces a rejecting provider call as an error result", async () => {
    const deps = makeDeps({
      deleteRecord: vi.fn().mockRejectedValue(new Error("Record not found.")),
    });
    const result = await toolNamed(
      createDomainsTools(deps),
      "dns_record_delete",
    ).execute({
      providerId: "prov-cf",
      domainId: "zone-1",
      recordId: "rec-1",
    });

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Record not found.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
