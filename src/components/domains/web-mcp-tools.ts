import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import { DNS_RECORD_TYPES } from "@/components/domains/validation";
import type {
  DnsRecord,
  DnsRecordInput,
  DnsRecordPatch,
} from "@/lib/providers/dns/types";
import type { DomainsByProvider } from "@/lib/services/domains";

// WebMCP tools for Domains / DNS. Registered from the dashboard layout (see
// src/components/shell/web-mcp-global-tools.tsx), so they need no live page
// state — only the /api/domains client.
//
// There is no server-side MCP catalog for DNS, so the names follow the same
// grammar the other catalogs use: a plural `*_list` read, singular
// `*_create`/`*_update`/`*_delete` writes.
//
// Every write here is a read-through to the DNS provider's own API: the
// ProviderSnapshot cache is display-only and never the target of a mutation
// (src/lib/providers/dns/types.ts). A created, changed or deleted record is
// live at the registrar the moment the call returns and this app has no undo
// for it, which is why each write tool says so in its description and why
// both `providerId` and `domainId` are always required — nothing is ever
// inferred from "the only provider".

/**
 * Every client API call the domain tools make, injected rather than imported
 * so the factory unit-tests without React or `fetch`. Each member matches the
 * signature of the same-named export in `src/components/domains/api.ts`.
 *
 * `refreshDomains()` is deliberately absent: it is a live fan-out across every
 * DNS credential in the workspace, it answers with the same rows
 * `fetchDomains()` already serves from the snapshot, and it exists as the
 * operator's "Retry" affordance after a provider error — not as something an
 * agent has any basis to decide to spend.
 */
export interface DomainsToolDeps {
  fetchDomains: () => Promise<DomainsByProvider[]>;
  fetchRecords: (providerId: string, domainId: string) => Promise<DnsRecord[]>;
  createRecord: (
    providerId: string,
    domainId: string,
    data: DnsRecordInput,
  ) => Promise<DnsRecord>;
  updateRecord: (
    providerId: string,
    domainId: string,
    recordId: string,
    data: DnsRecordPatch,
  ) => Promise<DnsRecord>;
  deleteRecord: (
    providerId: string,
    domainId: string,
    recordId: string,
  ) => Promise<void>;
  /** Re-runs the server fetch so a visible Domains page shows the change. */
  refresh: () => void;
}

// --- output budget ---
// A single tool result should stay near ~1500 characters, so record values are
// trimmed and both listings are capped.

const MAX_VALUE_LENGTH = 120;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const providerIdField = z
  .string()
  .min(1)
  .describe("Provider id from domains_list");

const domainIdField = z.string().min(1).describe("Domain id from domains_list");

const recordIdField = z
  .string()
  .min(1)
  .describe("Record id from dns_records_list");

// --- domains_list ---

const domainsListInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(25)
      .describe("Maximum number of domains to return"),
  })
  .strict();

function createDomainsListTool(deps: DomainsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "domains_list",
    title: "List domains",
    description:
      "Lists the workspace's DNS zones, one flat row per domain carrying the provider id and name alongside the domain id and name. A provider whose listing failed contributes no rows and is reported under providerErrors instead.",
    inputSchema: domainsListInputSchema,
    readOnly: true,
    // Zone names come from the registrar, not from this app.
    untrustedOutput: true,
    async handler({ limit }) {
      const groups = await deps.fetchDomains();

      const domains = groups.flatMap((group) =>
        group.domains.map((domain) => ({
          providerId: group.providerId,
          providerName: group.providerType,
          domainId: domain.id,
          domainName: domain.name,
          recordCount: domain.recordCount,
        })),
      );

      return {
        total: domains.length,
        domains: domains.slice(0, limit),
        providerErrors: groups
          .filter((group) => group.error !== null)
          .map((group) => ({
            providerId: group.providerId,
            providerName: group.providerType,
            error: group.error,
          })),
      };
    },
  });
}

// --- dns_records_list ---

const recordsListInputSchema = z
  .object({
    providerId: providerIdField,
    domainId: domainIdField,
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of records to return"),
  })
  .strict();

function createRecordsListTool(deps: DomainsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "dns_records_list",
    title: "List DNS records",
    description:
      "Reads one zone's DNS records live from its provider. Returns each record's id — required by dns_record_update and dns_record_delete — with its type, name, value and TTL.",
    inputSchema: recordsListInputSchema,
    readOnly: true,
    // Record values are registrar-held data, often third-party authored.
    untrustedOutput: true,
    async handler({ providerId, domainId, limit }) {
      const records = await deps.fetchRecords(providerId, domainId);
      return {
        total: records.length,
        records: records.slice(0, limit).map((record) => ({
          id: record.id,
          type: record.type,
          name: record.name,
          value: truncate(record.value, MAX_VALUE_LENGTH),
          ttl: record.ttl,
        })),
      };
    },
  });
}

// --- dns_record_create ---

const recordTypeField = z
  .enum(DNS_RECORD_TYPES)
  .describe("Record type; MX additionally requires priority");

const ttlField = z
  .number()
  .int()
  .positive()
  .describe("Time to live, in seconds");

const priorityField = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe("MX priority; required for MX, ignored by other types");

const recordCreateInputSchema = z
  .object({
    providerId: providerIdField,
    domainId: domainIdField,
    type: recordTypeField,
    name: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .describe("Record name, e.g. www or @ for the zone apex"),
    value: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe("Record value; must match the type (IPv4 for A, host for MX)"),
    ttl: ttlField,
    priority: priorityField,
  })
  .strict();

function createRecordCreateTool(deps: DomainsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "dns_record_create",
    title: "Create a DNS record",
    description:
      "Adds a DNS record to a zone. This writes straight to the provider's live API — the record is published as soon as the call returns and this app cannot undo it. Confirm the zone and the value with the operator first.",
    inputSchema: recordCreateInputSchema,
    readOnly: false,
    async handler({ providerId, domainId, type, name, value, ttl, priority }) {
      const created = await deps.createRecord(providerId, domainId, {
        type,
        name,
        value,
        ttl,
        ...(priority !== undefined ? { priority } : {}),
      });
      deps.refresh();
      return {
        recordId: created.id,
        type: created.type,
        name: created.name,
        domainId,
        providerId,
      };
    },
  });
}

// --- dns_record_update ---

const recordUpdateInputSchema = z
  .object({
    providerId: providerIdField,
    domainId: domainIdField,
    recordId: recordIdField,
    value: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional()
      .describe("New value; must still match the record's type"),
    ttl: ttlField.optional(),
    priority: priorityField,
  })
  .strict();

function createRecordUpdateTool(deps: DomainsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "dns_record_update",
    title: "Update a DNS record",
    description:
      "Changes an existing record's value, TTL or priority — a record's type and name cannot change, so replace it instead. This writes straight to the provider's live API and takes effect immediately; this app cannot undo it.",
    inputSchema: recordUpdateInputSchema,
    readOnly: false,
    async handler({ providerId, domainId, recordId, ...patch }) {
      if (Object.values(patch).every((field) => field === undefined)) {
        throw new Error("Pass at least one of value, ttl or priority.");
      }

      const updated = await deps.updateRecord(
        providerId,
        domainId,
        recordId,
        patch,
      );
      deps.refresh();
      return {
        recordId: updated.id,
        type: updated.type,
        name: updated.name,
        domainId,
        providerId,
      };
    },
  });
}

// --- dns_record_delete ---

const recordDeleteInputSchema = z
  .object({
    providerId: providerIdField,
    domainId: domainIdField,
    recordId: recordIdField,
  })
  .strict();

function createRecordDeleteTool(deps: DomainsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "dns_record_delete",
    title: "Delete a DNS record",
    description:
      "Removes a DNS record from a zone. This writes straight to the provider's live API: the record stops resolving immediately and this app cannot restore it. Read the record with dns_records_list and confirm it with the operator first.",
    inputSchema: recordDeleteInputSchema,
    readOnly: false,
    async handler({ providerId, domainId, recordId }) {
      await deps.deleteRecord(providerId, domainId, recordId);
      deps.refresh();
      return { recordId, domainId, providerId, deleted: true };
    },
  });
}

/** Every domains/DNS WebMCP tool, in the order an agent would discover them. */
export function createDomainsTools(deps: DomainsToolDeps): WebMcpTool[] {
  return [
    createDomainsListTool(deps),
    createRecordsListTool(deps),
    createRecordCreateTool(deps),
    createRecordUpdateTool(deps),
    createRecordDeleteTool(deps),
  ];
}
