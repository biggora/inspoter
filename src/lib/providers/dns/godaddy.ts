import { createProviderHttpClient } from "@/lib/providers/http";
import type {
  DnsProvider,
  Domain,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

const BASE_URL = "https://api.godaddy.com/v1";

interface GoDaddyDomain {
  domainId: number;
  domain: string;
  status: string;
}

interface GoDaddyDnsRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
}

function toDomain(domain: GoDaddyDomain): Domain {
  return { id: domain.domain, name: domain.domain, provider: "godaddy" };
}

function toDnsRecord(record: GoDaddyDnsRecord): DnsRecord {
  return {
    id: `${record.type}-${record.name}`,
    type: record.type,
    name: record.name,
    value: record.data,
    ttl: record.ttl,
  };
}

// GoDaddy has no numeric record IDs; type+name identifies a record, so
// DnsRecord.id is synthesized as "{type}-{name}" and parsed back here.
function parseRecordId(recordId: string): { type: string; name: string } {
  const separatorIndex = recordId.indexOf("-");
  return {
    type: recordId.slice(0, separatorIndex),
    name: recordId.slice(separatorIndex + 1),
  };
}

export class GoDaddyDnsProvider implements DnsProvider {
  readonly id: string;
  readonly providerType = "godaddy";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(id: string, label: string, apiKey: string, apiSecret: string) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: { Authorization: `sso-key ${apiKey}:${apiSecret}` },
    });
  }

  async listDomains(): Promise<ProviderResult<Domain[]>> {
    const result = await this.client.request<GoDaddyDomain[]>({
      path: "/domains",
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(toDomain) };
  }

  async listRecords(domainId: string): Promise<ProviderResult<DnsRecord[]>> {
    const result = await this.client.request<GoDaddyDnsRecord[]>({
      path: `/domains/${domainId}/records`,
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(toDnsRecord) };
  }

  async createRecord(
    domainId: string,
    input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>> {
    const putResult = await this.putRecord(domainId, input.type, input.name, [
      {
        data: input.value,
        ttl: input.ttl,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    ]);
    if (!putResult.ok) return putResult;
    return {
      ok: true,
      data: {
        id: `${input.type}-${input.name}`,
        type: input.type,
        name: input.name,
        value: input.value,
        ttl: input.ttl,
      },
    };
  }

  async updateRecord(
    domainId: string,
    recordId: string,
    input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>> {
    const { type, name } = parseRecordId(recordId);

    let value = input.value;
    let ttl = input.ttl;

    // GoDaddy's PUT replaces the full record body, so a partial patch
    // requires reading the current value/ttl first when either is omitted.
    if (value === undefined || ttl === undefined) {
      const existing = await this.listRecords(domainId);
      if (!existing.ok) return existing;
      const current = existing.data.find((record) => record.id === recordId);
      if (!current) {
        return { ok: false, kind: "error", message: "Record not found" };
      }
      value = value ?? current.value;
      ttl = ttl ?? current.ttl;
    }

    const putResult = await this.putRecord(domainId, type, name, [
      {
        data: value,
        ttl,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    ]);
    if (!putResult.ok) return putResult;
    return { ok: true, data: { id: recordId, type, name, value, ttl } };
  }

  async deleteRecord(
    domainId: string,
    recordId: string,
  ): Promise<ProviderResult<void>> {
    const { type, name } = parseRecordId(recordId);
    try {
      const result = await this.client.request<unknown>({
        method: "DELETE",
        path: `/domains/${domainId}/records/${type}/${name}`,
      });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    } catch {
      // GoDaddy returns 204 with no body; response.json() throws on the
      // empty body even though the delete already succeeded.
      return { ok: true, data: undefined };
    }
  }

  private async putRecord(
    domainId: string,
    type: string,
    name: string,
    body: unknown[],
  ): Promise<ProviderResult<void>> {
    try {
      const result = await this.client.request<unknown>({
        method: "PUT",
        path: `/domains/${domainId}/records/${type}/${name}`,
        body,
      });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    } catch {
      // GoDaddy returns 200 with no body on a successful upsert;
      // response.json() throws on the empty body even though it succeeded.
      return { ok: true, data: undefined };
    }
  }
}
