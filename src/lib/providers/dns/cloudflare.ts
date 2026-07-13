import type {
  DnsProvider,
  Domain,
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { ProviderResult } from "@/lib/providers/result";

function unsupported<T>(operation: string): ProviderResult<T> {
  return { ok: false, kind: "unsupported", operation };
}

export class CloudflareDnsProvider implements DnsProvider {
  readonly id = "cloudflare" as const;
  readonly mode = "real" as const;

  async listDomains(): Promise<ProviderResult<Domain[]>> {
    return unsupported("listDomains");
  }

  async listRecords(_domainId: string): Promise<ProviderResult<DnsRecord[]>> {
    return unsupported("listRecords");
  }

  async createRecord(
    _domainId: string,
    _input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>> {
    return unsupported("createRecord");
  }

  async updateRecord(
    _domainId: string,
    _recordId: string,
    _input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>> {
    return unsupported("updateRecord");
  }

  async deleteRecord(
    _domainId: string,
    _recordId: string,
  ): Promise<ProviderResult<void>> {
    return unsupported("deleteRecord");
  }
}
