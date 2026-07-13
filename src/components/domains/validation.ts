// Client-side pre-validation mirroring src/lib/validation/dns.ts
// (backend-dev-owned, authoritative) so field errors render immediately
// without waiting on a network round trip (AC-DOM-008). The API response is
// still parsed defensively (see api.ts) as a second line of defense for any
// rule this client copy doesn't cover. Pattern matches
// src/components/bookmarks/validation.ts.

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
): string | null {
  if (!value.trim()) return "Value is required";
  if (type === "A" && !ipv4Regex.test(value)) {
    return "A record value must be a valid IPv4 address";
  }
  if (type === "AAAA" && !ipv6Regex.test(value)) {
    return "AAAA record value must be a valid IPv6 address";
  }
  if ((type === "CNAME" || type === "NS") && !hostnameRegex.test(value)) {
    return `${type} record value must be a valid hostname`;
  }
  if (type === "MX" && !hostnameRegex.test(value)) {
    return "MX record value must be a valid mail-server hostname";
  }
  return null;
}

export function validateTtl(ttl: string): string | null {
  if (!ttl.trim()) return "TTL is required";
  const parsed = Number(ttl);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "TTL must be a positive integer";
  }
  return null;
}

export function validatePriority(priority: string): string | null {
  if (!priority.trim()) return "MX record requires a numeric priority";
  const parsed = Number(priority);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return "Priority must be a non-negative integer";
  }
  return null;
}
