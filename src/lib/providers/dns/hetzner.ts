import { createProviderHttpClient } from "@/lib/providers/http";
import type {
  DnsProvider,
  Domain,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

const BASE_URL = "https://dns.hetzner.com/api/v1";

interface HetznerZone {
  id: string;
  name: string;
}

interface HetznerRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
}

function toDomain(zone: HetznerZone): Domain {
  return { id: zone.id, name: zone.name, provider: "hetzner" };
}

function toDnsRecord(record: HetznerRecord): DnsRecord {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    value: record.value,
    ttl: record.ttl,
  };
}

export class HetznerDnsProvider implements DnsProvider {
  readonly id = "hetzner" as const;
  readonly mode = "real" as const;
  private readonly client;

  constructor(apiToken: string) {
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: { "Auth-API-Token": apiToken },
    });
  }

  async listDomains(): Promise<ProviderResult<Domain[]>> {
    const result = await this.client.request<{ zones: HetznerZone[] }>({
      path: "/zones",
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.zones.map(toDomain) };
  }

  async listRecords(domainId: string): Promise<ProviderResult<DnsRecord[]>> {
    const result = await this.client.request<{ records: HetznerRecord[] }>({
      path: `/records?zone_id=${domainId}`,
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.records.map(toDnsRecord) };
  }

  async createRecord(
    domainId: string,
    input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>> {
    const result = await this.client.request<{ record: HetznerRecord }>({
      method: "POST",
      path: "/records",
      body: {
        zone_id: domainId,
        type: input.type,
        name: input.name,
        value: input.value,
        ttl: input.ttl,
      },
    });
    if (!result.ok) return result;
    return { ok: true, data: toDnsRecord(result.data.record) };
  }

  async updateRecord(
    domainId: string,
    recordId: string,
    input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>> {
    const existing = await this.client.request<{ record: HetznerRecord }>({
      path: `/records/${recordId}`,
    });
    if (!existing.ok) return existing;

    const result = await this.client.request<{ record: HetznerRecord }>({
      method: "PUT",
      path: `/records/${recordId}`,
      body: {
        zone_id: domainId,
        type: existing.data.record.type,
        name: existing.data.record.name,
        value: input.value ?? existing.data.record.value,
        ttl: input.ttl ?? existing.data.record.ttl,
      },
    });
    if (!result.ok) return result;
    return { ok: true, data: toDnsRecord(result.data.record) };
  }

  async deleteRecord(
    domainId: string,
    recordId: string,
  ): Promise<ProviderResult<void>> {
    // Hetzner returns 200 with an empty body on delete, which fails
    // response.json() in the shared HTTP client — a successful response
    // that throws while parsing is still a successful delete.
    try {
      const result = await this.client.request<unknown>({
        method: "DELETE",
        path: `/records/${recordId}`,
      });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    } catch {
      return { ok: true, data: undefined };
    }
  }
}
