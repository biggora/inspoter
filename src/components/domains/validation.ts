// Client-side pre-validation mirroring src/lib/validation/dns.ts
// (backend-dev-owned, authoritative) so field errors render immediately
// without waiting on a network round trip (AC-DOM-008). The API response is
// still parsed defensively (see api.ts) as a second line of defense for any
// rule this client copy doesn't cover. Pattern matches
// src/components/bookmarks/validation.ts.
//
// This module has no i18n namespace of its own (it's not a component) — the
// caller passes its own "domains" namespace `t` for the messages, same
// pattern as src/lib/format/relative-time.ts.

type Translate = (key: string, params?: Record<string, string>) => string;

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
] as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

const hostnameRegex =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

// Returns an error message for the given type/value pair, or null if valid.
export function validateRecordValue(
  type: DnsRecordType,
  value: string,
  t: Translate,
): string | null {
  if (!value.trim()) return t("valueRequiredError");
  if (type === "A" && !ipv4Regex.test(value)) {
    return t("valueInvalidIpv4Error");
  }
  if (type === "AAAA" && !ipv6Regex.test(value)) {
    return t("valueInvalidIpv6Error");
  }
  if ((type === "CNAME" || type === "NS") && !hostnameRegex.test(value)) {
    return t("valueInvalidHostnameError", { type });
  }
  if (type === "MX" && !hostnameRegex.test(value)) {
    return t("valueInvalidMxError");
  }
  return null;
}

export function validateTtl(ttl: string, t: Translate): string | null {
  if (!ttl.trim()) return t("ttlRequiredError");
  const parsed = Number(ttl);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return t("ttlInvalidError");
  }
  return null;
}

export function validatePriority(
  priority: string,
  t: Translate,
): string | null {
  if (!priority.trim()) return t("priorityRequiredError");
  const parsed = Number(priority);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return t("priorityInvalidError");
  }
  return null;
}
