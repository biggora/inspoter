import type {
  Domain,
  DnsProvider,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

// Deterministic mock DNS data (AC-DOM-002, AC-PROV-001, N-13) — zero network
// calls, process-local mutable state so create/update/delete round-trip
// within a running process. Seeded once per provider id.

interface MockState {
  domains: Domain[];
  records: Map<string, DnsRecord[]>;
}

const seeds: Record<DnsProvider["id"], MockState> = {
  cloudflare: {
    domains: [
      { id: "cf-example-com", name: "example.com", provider: "cloudflare" },
      { id: "cf-example-dev", name: "example.dev", provider: "cloudflare" },
    ],
    records: new Map([
      [
        "cf-example-com",
        [
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
        ],
      ],
      [
        "cf-example-dev",
        [
          { id: "cf-rec-4", type: "A", name: "@", value: "192.0.2.11", ttl: 3600 },
        ],
      ],
    ]),
  },
  hetzner: {
    domains: [
      {
        id: "hz-example-de",
        name: "example-host.de",
        provider: "hetzner",
      },
      { id: "hz-myserver-net", name: "myserver.net", provider: "hetzner" },
    ],
    records: new Map([
      [
        "hz-example-de",
        [
          { id: "hz-rec-1", type: "A", name: "@", value: "203.0.113.20", ttl: 300 },
          {
            id: "hz-rec-2",
            type: "MX",
            name: "@",
            value: "mail.example-host.de",
            ttl: 300,
          },
        ],
      ],
      [
        "hz-myserver-net",
        [
          {
            id: "hz-rec-3",
            type: "AAAA",
            name: "@",
            value: "2001:db8::1",
            ttl: 300,
          },
        ],
      ],
    ]),
  },
  godaddy: {
    domains: [
      { id: "gd-mysite-com", name: "mysite.com", provider: "godaddy" },
      { id: "gd-shop-io", name: "shop.io", provider: "godaddy" },
      { id: "gd-blog-app", name: "blog.app", provider: "godaddy" },
    ],
    records: new Map([
      [
        "gd-mysite-com",
        [
          { id: "gd-rec-1", type: "A", name: "@", value: "198.51.100.5", ttl: 600 },
          {
            id: "gd-rec-2",
            type: "CNAME",
            name: "www",
            value: "mysite.com",
            ttl: 600,
          },
        ],
      ],
      [
        "gd-shop-io",
        [
          { id: "gd-rec-3", type: "A", name: "@", value: "198.51.100.6", ttl: 600 },
        ],
      ],
      [
        "gd-blog-app",
        [
          {
            id: "gd-rec-4",
            type: "TXT",
            name: "@",
            value: "google-site-verification=abc123",
            ttl: 600,
          },
        ],
      ],
    ]),
  },
};

let recordCounter = 0;

export class MockDnsProvider implements DnsProvider {
  readonly mode = "mock" as const;

  constructor(readonly id: DnsProvider["id"]) {}

  private state(): MockState {
    return seeds[this.id];
  }

  async listDomains(): Promise<ProviderResult<Domain[]>> {
    return { ok: true, data: [...this.state().domains] };
  }

  async listRecords(domainId: string): Promise<ProviderResult<DnsRecord[]>> {
    const records = this.state().records.get(domainId);
    if (!records) {
      return { ok: false, kind: "error", message: "Domain not found" };
    }
    return { ok: true, data: [...records] };
  }

  async createRecord(
    domainId: string,
    input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>> {
    const records = this.state().records.get(domainId);
    if (!records) {
      return { ok: false, kind: "error", message: "Domain not found" };
    }
    const record: DnsRecord = {
      id: `${this.id}-mock-rec-${++recordCounter}`,
      type: input.type,
      name: input.name,
      value: input.value,
      ttl: input.ttl,
    };
    records.push(record);
    return { ok: true, data: record };
  }

  async updateRecord(
    domainId: string,
    recordId: string,
    input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>> {
    const records = this.state().records.get(domainId);
    const record = records?.find((r) => r.id === recordId);
    if (!records || !record) {
      return { ok: false, kind: "error", message: "Record not found" };
    }
    if (input.value !== undefined) record.value = input.value;
    if (input.ttl !== undefined) record.ttl = input.ttl;
    return { ok: true, data: record };
  }

  async deleteRecord(
    domainId: string,
    recordId: string,
  ): Promise<ProviderResult<void>> {
    const records = this.state().records.get(domainId);
    if (!records) {
      return { ok: false, kind: "error", message: "Domain not found" };
    }
    const index = records.findIndex((r) => r.id === recordId);
    if (index === -1) {
      return { ok: false, kind: "error", message: "Record not found" };
    }
    records.splice(index, 1);
    return { ok: true, data: undefined };
  }
}
