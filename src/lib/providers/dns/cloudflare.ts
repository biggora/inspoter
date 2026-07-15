import { createProviderHttpClient } from "@/lib/providers/http";
import type {
  DnsProvider,
  Domain,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

const BASE_URL = "https://api.cloudflare.com/client/v4";

interface CloudflareError {
  code: number;
  message: string;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: CloudflareError[];
  result: T;
}

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

function toDomain(zone: CloudflareZone): Domain {
  return { id: zone.id, name: zone.name, provider: "cloudflare" };
}

function toDnsRecord(record: CloudflareDnsRecord): DnsRecord {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    value: record.content,
    ttl: record.ttl,
  };
}

function envelopeError<T>(errors: CloudflareError[]): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: errors[0]?.message ?? "Provider error",
  };
}

export class CloudflareDnsProvider implements DnsProvider {
  readonly id: string;
  readonly providerType = "cloudflare";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(id: string, label: string, apiToken: string) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }

  async listDomains(): Promise<ProviderResult<Domain[]>> {
    const result = await this.client.request<
      CloudflareEnvelope<CloudflareZone[]>
    >({ path: "/zones" });
    if (!result.ok) return result;
    if (!result.data.success) return envelopeError(result.data.errors);
    return { ok: true, data: result.data.result.map(toDomain) };
  }

  async listRecords(domainId: string): Promise<ProviderResult<DnsRecord[]>> {
    const result = await this.client.request<
      CloudflareEnvelope<CloudflareDnsRecord[]>
    >({ path: `/zones/${domainId}/dns_records` });
    if (!result.ok) return result;
    if (!result.data.success) return envelopeError(result.data.errors);
    return { ok: true, data: result.data.result.map(toDnsRecord) };
  }

  async createRecord(
    domainId: string,
    input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>> {
    const result = await this.client.request<
      CloudflareEnvelope<CloudflareDnsRecord>
    >({
      method: "POST",
      path: `/zones/${domainId}/dns_records`,
      body: {
        type: input.type,
        name: input.name,
        content: input.value,
        ttl: input.ttl,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });
    if (!result.ok) return result;
    if (!result.data.success) return envelopeError(result.data.errors);
    return { ok: true, data: toDnsRecord(result.data.result) };
  }

  async updateRecord(
    domainId: string,
    recordId: string,
    input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>> {
    const body: Record<string, unknown> = {};
    if (input.value !== undefined) body.content = input.value;
    if (input.ttl !== undefined) body.ttl = input.ttl;
    if (input.priority !== undefined) body.priority = input.priority;

    const result = await this.client.request<
      CloudflareEnvelope<CloudflareDnsRecord>
    >({
      method: "PATCH",
      path: `/zones/${domainId}/dns_records/${recordId}`,
      body,
    });
    if (!result.ok) return result;
    if (!result.data.success) return envelopeError(result.data.errors);
    return { ok: true, data: toDnsRecord(result.data.result) };
  }

  async deleteRecord(
    domainId: string,
    recordId: string,
  ): Promise<ProviderResult<void>> {
    const result = await this.client.request<
      CloudflareEnvelope<{ id: string }>
    >({
      method: "DELETE",
      path: `/zones/${domainId}/dns_records/${recordId}`,
    });
    if (!result.ok) return result;
    if (!result.data.success) return envelopeError(result.data.errors);
    return { ok: true, data: undefined };
  }
}
