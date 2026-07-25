// Turns a read-through domain / DNS record (src/lib/providers/dns/types.ts —
// never persisted in Prisma) into the payload of a *persisted* Bookmark or
// Service, and matches it back against the ones a workspace already has.
// Pure functions only: the domains views own the dialogs, this module owns
// the "what does this row map to" rules.

import type { Bookmark, Service } from "@/generated/prisma/client";
import type { DnsRecord } from "@/lib/providers/dns/types";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";

export interface BookmarkTarget {
  name: string;
  url: string;
}

export interface MonitorTarget {
  name: string;
  monitorType: "HTTP" | "PING";
  url?: string;
  host?: string;
}

export interface LinkTarget {
  /** Display name of the target — the FQDN, or the MX/NS mail server host. */
  label: string;
  /** `null` when the row has nothing web-addressable to bookmark. */
  bookmark: BookmarkTarget | null;
  /** `null` when the row has nothing to probe. */
  monitor: MonitorTarget | null;
}

export interface LinkedState {
  bookmarkId: string | null;
  serviceId: string | null;
}

export const EMPTY_LINKED_STATE: LinkedState = {
  bookmarkId: null,
  serviceId: null,
};

// A/AAAA/CNAME point at something an operator can open in a browser; MX/NS
// carry a hostname in their *value* (the record name is usually the apex),
// so those are ping-only. Everything else (TXT, SRV, CAA, …) is neither.
const WEB_RECORD_TYPES = new Set(["A", "AAAA", "CNAME"]);
const HOST_VALUE_RECORD_TYPES = new Set(["MX", "NS"]);

function stripTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

/**
 * Resolves a `DnsRecord.name` to a fully qualified name. Providers disagree
 * on the shape: Cloudflare returns the FQDN, Hetzner/GoDaddy/mock return a
 * relative name (`"@"` for the apex, `"www"` for a subdomain).
 */
export function toFqdn(recordName: string, domainName: string): string {
  const zone = stripTrailingDot(domainName.trim().toLowerCase());
  const name = stripTrailingDot(recordName.trim().toLowerCase());
  if (name === "" || name === "@") return zone;
  if (name === zone || name.endsWith(`.${zone}`)) return name;
  return `${name}.${zone}`;
}

export function domainLinkTarget(domainName: string): LinkTarget {
  const fqdn = stripTrailingDot(domainName.trim().toLowerCase());
  return {
    label: fqdn,
    bookmark: { name: fqdn, url: `https://${fqdn}` },
    monitor: { name: fqdn, monitorType: "HTTP", url: `https://${fqdn}` },
  };
}

export function recordLinkTarget(
  record: Pick<DnsRecord, "type" | "name" | "value">,
  domainName: string,
): LinkTarget {
  const type = record.type.toUpperCase();

  if (WEB_RECORD_TYPES.has(type)) {
    const fqdn = toFqdn(record.name, domainName);
    return {
      label: fqdn,
      bookmark: { name: fqdn, url: `https://${fqdn}` },
      monitor: { name: fqdn, monitorType: "HTTP", url: `https://${fqdn}` },
    };
  }

  if (HOST_VALUE_RECORD_TYPES.has(type)) {
    // MX values may carry a leading priority ("10 mail.example.com") when a
    // provider folds it into the value string; take the last token.
    const host = stripTrailingDot(
      record.value.trim().toLowerCase().split(/\s+/).pop() ?? "",
    );
    if (!host) return { label: record.name, bookmark: null, monitor: null };
    return {
      label: host,
      bookmark: null,
      monitor: { name: host, monitorType: "PING", host },
    };
  }

  return { label: record.name, bookmark: null, monitor: null };
}

/**
 * Accepts either a URL or a bare host and returns the lowercase hostname.
 * `www.example.com` and `example.com` stay distinct on purpose — they are
 * different targets, and collapsing them would hide one behind the other.
 */
export function normalizeHost(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    return stripTrailingDot(host) || null;
  } catch {
    return null;
  }
}

function serviceHost(service: Pick<Service, "monitorType" | "url" | "host">) {
  return normalizeHost(
    service.monitorType === "HTTP" ? service.url : service.host,
  );
}

/**
 * Index of "this host already exists in the workspace", keyed by hostname.
 * The first match wins, so a host bookmarked twice resolves to the bookmark
 * an operator sees first on the bookmarks board.
 */
export function buildLinkedIndex(
  categories: CategoryWithBookmarks[],
  services: Array<Pick<Service, "id" | "monitorType" | "url" | "host">>,
): Map<string, LinkedState> {
  const index = new Map<string, LinkedState>();

  const entryFor = (host: string): LinkedState => {
    const existing = index.get(host);
    if (existing) return existing;
    const created: LinkedState = { bookmarkId: null, serviceId: null };
    index.set(host, created);
    return created;
  };

  for (const bookmark of flattenBookmarks(categories)) {
    const host = normalizeHost(bookmark.url);
    if (!host) continue;
    const entry = entryFor(host);
    entry.bookmarkId ??= bookmark.id;
  }

  for (const service of services) {
    const host = serviceHost(service);
    if (!host) continue;
    const entry = entryFor(host);
    entry.serviceId ??= service.id;
  }

  return index;
}

export function lookupLinkedState(
  index: Map<string, LinkedState>,
  target: LinkTarget,
): LinkedState {
  const host = normalizeHost(
    target.bookmark?.url ?? target.monitor?.url ?? target.monitor?.host ?? null,
  );
  return (host && index.get(host)) || EMPTY_LINKED_STATE;
}

function flattenBookmarks(categories: CategoryWithBookmarks[]): Bookmark[] {
  return categories.flatMap((category) => [
    ...category.bookmarks,
    ...category.childCategories.flatMap((child) => child.bookmarks),
  ]);
}
