import { lookup as dnsLookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import * as ipaddr from "ipaddr.js";
import { Agent } from "undici";
import { env } from "@/lib/config/env";

// Outbound fetch for the dashboard feed widgets (RSS and YouTube). Unlike the
// weather call, the URL here is typed by an operator, so this is the one place
// that has to decide what an operator-supplied URL may reach.
//
// Policy: Inspoter is self-hosted, and the feed an operator wants is often on
// their own LAN (a local n8n merging feeds, an RSS bridge), so private and
// loopback addresses are allowed by default. What is never reachable is the
// class of address that has no business being a feed host: link-local (which
// holds the cloud metadata endpoint 169.254.169.254), unspecified, broadcast,
// multicast and reserved ranges, plus the three metadata endpoints that sit
// outside link-local (Alibaba 100.100.100.200, AWS and GCP over IPv6). IPv6
// forms that carry an IPv4 address (IPv4-mapped, NAT64, IPv4-translated) are
// judged by the IPv4 address inside. DASHBOARD_FEEDS_BLOCK_PRIVATE additionally
// refuses private, loopback, unique-local, deprecated site-local and
// carrier-grade-NAT addresses for deployments that want feeds from the public
// internet only.
//
// The address check runs inside the socket's DNS lookup, not before it, so it
// applies to the address the connection really uses — a hostname that resolves
// to a public address when checked and a private one when connected (DNS
// rebinding) cannot slip through. Literal-IP hosts skip DNS entirely, so they
// are checked up front. Redirects are followed by hand (at most MAX_REDIRECTS)
// so every hop is re-validated; the whole exchange shares one 8 s deadline and
// the body is capped at 2 MB.
//
// Callers get the body text only. Error messages never quote the response.

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "Inspoter-Feeds/1";
const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5";

/** Ranges refused in every deployment. */
const ALWAYS_BLOCKED_RANGES = new Set([
  "linkLocal",
  "unspecified",
  "broadcast",
  "multicast",
  "reserved",
]);

/** Ranges additionally refused when DASHBOARD_FEEDS_BLOCK_PRIVATE is on. */
const PRIVATE_RANGES = new Set([
  "private",
  "loopback",
  "uniqueLocal",
  "carrierGradeNat",
  "deprecatedSiteLocal",
]);

/** Metadata endpoints that are not link-local, so no range rule catches them. */
const ALWAYS_BLOCKED_ADDRESSES = new Set(
  ["100.100.100.200", "fd00:ec2::254", "fd20:ce::254"].map((address) =>
    ipaddr.parse(address).toNormalizedString(),
  ),
);

/** IPv6 ranges whose last 32 bits are an IPv4 address. */
const EMBEDDED_IPV4_RANGES = new Set(["rfc6052", "rfc6145"]);

export class FeedUnavailableError extends Error {
  readonly code = "FEED_UNAVAILABLE" as const;
  /** The HTTP status behind the failure, when there was one. */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FeedUnavailableError";
    this.status = status;
  }
}

export interface FetchFeedOptions {
  headers?: Record<string, string>;
  /** Defaults to env.DASHBOARD_FEEDS_BLOCK_PRIVATE. */
  blockPrivate?: boolean;
}

export function isBlockedFeedAddress(
  ip: string,
  blockPrivate: boolean,
): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return true;
  }
  // ::ffff:127.0.0.1 reaches the same host as 127.0.0.1, and 64:ff9b::a9fe:a9fe
  // (NAT64) reaches 169.254.169.254, so these are judged as the IPv4 inside.
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    } else if (EMBEDDED_IPV4_RANGES.has(v6.range())) {
      const [hi, lo] = v6.parts.slice(6);
      parsed = new ipaddr.IPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
    }
  }
  if (ALWAYS_BLOCKED_ADDRESSES.has(parsed.toNormalizedString())) return true;
  const range = parsed.range();
  if (ALWAYS_BLOCKED_RANGES.has(range)) return true;
  return blockPrivate && PRIVATE_RANGES.has(range);
}

const HOST_NOT_ALLOWED = "Feed host is not allowed";

/**
 * A `net` DNS lookup that fails when any resolved address is blocked. Exported
 * so the rebinding guard can be tested without a socket.
 */
export function createGuardedLookup(blockPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "", 4);
        return;
      }
      if (
        addresses.length === 0 ||
        addresses.some((a) => isBlockedFeedAddress(a.address, blockPrivate))
      ) {
        callback(new FeedUnavailableError(HOST_NOT_ALLOWED), "", 4);
        return;
      }
      if (options.all) {
        (callback as unknown as (e: null, a: typeof addresses) => void)(
          null,
          addresses,
        );
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

// One pooled agent per policy, created on first use: a fresh Agent per request
// would leak its connection pool.
const agents = new Map<boolean, Agent>();

function agentFor(blockPrivate: boolean): Agent {
  let agent = agents.get(blockPrivate);
  if (!agent) {
    agent = new Agent({
      connect: { lookup: createGuardedLookup(blockPrivate) },
    });
    agents.set(blockPrivate, agent);
  }
  return agent;
}

function assertAllowedUrl(url: URL, blockPrivate: boolean): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FeedUnavailableError("Feed URL must use http or https");
  }
  // WHATWG URL wraps IPv6 literals in brackets.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && isBlockedFeedAddress(host, blockPrivate)) {
    throw new FeedUnavailableError(HOST_NOT_ALLOWED);
  }
}

function describeNetworkError(error: unknown): FeedUnavailableError {
  if (error instanceof FeedUnavailableError) return error;
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return new FeedUnavailableError("Feed request timed out");
    }
    // undici wraps the socket-level failure (including our lookup's refusal) in
    // a generic "fetch failed" TypeError.
    if (error.cause instanceof FeedUnavailableError) return error.cause;
  }
  return new FeedUnavailableError("Could not reach the feed host");
}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new FeedUnavailableError("Feed is larger than 2 MB");
  }

  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new FeedUnavailableError("Feed is larger than 2 MB");
      }
      chunks.push(value);
    }
  } catch (error) {
    throw describeNetworkError(error);
  }

  return decode(Buffer.concat(chunks), response.headers.get("content-type"));
}

// Feeds from older CMSes still ship windows-1251 / ISO-8859-x. The charset the
// server declares wins; without one, the XML prolog (<?xml ... encoding="..."?>)
// names it; anything unknown falls back to UTF-8.
function charsetOf(
  bytes: Buffer,
  contentType: string | null,
): string | undefined {
  const declared = /charset=["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
  if (declared) return declared;
  // The prolog is ASCII in every charset a feed uses, so latin1 reads it as is.
  const prolog = bytes.subarray(0, 256).toString("latin1");
  return /^(?:\xEF\xBB\xBF)?\s*<\?xml[^>]*encoding=["']([\w.:-]+)/.exec(
    prolog,
  )?.[1];
}

function decode(bytes: Buffer, contentType: string | null): string {
  const charset = charsetOf(bytes, contentType);
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function fetchFeedText(
  url: URL,
  options: FetchFeedOptions = {},
): Promise<{ text: string; finalUrl: URL }> {
  const blockPrivate =
    options.blockPrivate ?? env.DASHBOARD_FEEDS_BLOCK_PRIVATE;
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const dispatcher = agentFor(blockPrivate);
  const origin = url.origin;

  let current = url;
  for (let hop = 0; ; hop++) {
    assertAllowedUrl(current, blockPrivate);

    // Caller headers (a cookie, say) belong to the host they were written for;
    // a redirect to another origin does not get them.
    const callerHeaders = current.origin === origin ? options.headers : {};
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal,
        // Next would otherwise apply its own fetch cache to this call; the TTL
        // caches in rss.ts / youtube.ts are the one place caching happens.
        cache: "no-store",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: ACCEPT,
          ...callerHeaders,
        },
        dispatcher,
      } as RequestInit);
    } catch (error) {
      throw describeNetworkError(error);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) {
        throw new FeedUnavailableError(
          `Feed responded with ${response.status}`,
        );
      }
      if (hop >= MAX_REDIRECTS) {
        throw new FeedUnavailableError("Feed redirected too many times");
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new FeedUnavailableError("Feed redirected to an invalid URL");
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new FeedUnavailableError(
        `Feed responded with ${response.status}`,
        response.status,
      );
    }

    return { text: await readCapped(response), finalUrl: current };
  }
}
