// DNS provider DTOs (architecture.md §4.1, ADR-004) — Domain/DnsRecord are
// read-through provider types, never persisted in Prisma.

import type { ProviderResult } from "@/lib/providers/result";

export interface Domain {
  id: string;
  name: string;
  provider: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
}

export interface DnsRecordInput {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
}

export interface DnsRecordPatch {
  value?: string;
  ttl?: number;
  priority?: number;
}

export interface DnsProvider {
  readonly id: string;
  readonly providerType: string;
  readonly label: string;
  readonly mode: "real" | "mock";
  listDomains(): Promise<ProviderResult<Domain[]>>;
  listRecords(domainId: string): Promise<ProviderResult<DnsRecord[]>>;
  createRecord(
    domainId: string,
    input: DnsRecordInput,
  ): Promise<ProviderResult<DnsRecord>>;
  updateRecord(
    domainId: string,
    recordId: string,
    input: DnsRecordPatch,
  ): Promise<ProviderResult<DnsRecord>>;
  deleteRecord(
    domainId: string,
    recordId: string,
  ): Promise<ProviderResult<void>>;
}
