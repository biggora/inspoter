import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import { FeedUnavailableError } from "@/lib/net/feed-fetch";

// Turns the XML of an RSS 2.0, Atom or RSS 1.0 (RDF) feed into one neutral
// shape the RSS and YouTube widgets both read. Everything that comes out is
// either plain text or an absolute http(s) URL: titles and summaries are run
// through sanitize-html with no tags allowed, links that are not http(s)
// (`javascript:`, `data:`) become null. No markup from a feed ever reaches a
// tile.
//
// Entity expansion is capped. A feed is untrusted text, and a DOCTYPE that
// defines entities in terms of each other ("billion laughs") would otherwise
// grow without bound; past the limits the parser throws, which surfaces as
// "Not an RSS or Atom feed". External entities are never fetched.
//
// `raw` is the parsed entry object as the XML parser produced it. It exists so
// the YouTube module can read `yt:videoId` and `media:group` without this file
// knowing about YouTube; it must not be copied into a widget payload.

const SUMMARY_MAX = 300;
const TITLE_MAX = 300;

export interface ParsedFeedItem {
  title: string;
  url: string | null;
  publishedAt: string | null;
  summary: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  items: ParsedFeedItem[];
}

type Node = Record<string, unknown>;

const ARRAY_TAGS = new Set(["item", "entry", "link"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep "2024" or "1e3" as the strings the feed wrote.
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: {
    enabled: true,
    maxEntitySize: 1_000,
    maxEntityCount: 20,
    maxExpandedLength: 100_000,
  },
  isArray: (tagName, _path, _isLeaf, isAttribute) =>
    !isAttribute && ARRAY_TAGS.has(tagName),
});

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first element of a possibly-repeated XML child. */
export function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** The text content of an XML child, whether it has attributes or not. */
function textOf(value: unknown): string {
  const node = first(value);
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (isNode(node)) return textOf(node["#text"]);
  return "";
}

function plainText(value: unknown, max: number): string {
  const stripped = sanitizeHtml(textOf(value), {
    allowedTags: [],
    allowedAttributes: {},
  });
  // sanitize-html returns escaped text; a tile renders it as text, so undo the
  // escaping rather than showing "&amp;".
  const text = stripped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function toAbsoluteHttpUrl(raw: string, baseUrl: URL): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// RSS carries the link as element text, Atom as an `href` attribute on
// possibly several <link> elements — the `alternate` one is the page itself.
function linkOf(links: unknown, baseUrl: URL): string | null {
  const candidates = Array.isArray(links) ? links : [links];
  let fallback: string | null = null;
  for (const link of candidates) {
    if (typeof link === "string") {
      const url = toAbsoluteHttpUrl(link, baseUrl);
      if (url) return url;
      continue;
    }
    if (!isNode(link)) continue;
    const href = link["@_href"];
    if (typeof href !== "string") continue;
    const rel = link["@_rel"];
    if (rel === undefined || rel === "alternate") {
      const url = toAbsoluteHttpUrl(href, baseUrl);
      if (url) return url;
    } else if (fallback === null) {
      fallback = toAbsoluteHttpUrl(href, baseUrl);
    }
  }
  return fallback;
}

function dateOf(entry: Node): string | null {
  for (const key of ["pubDate", "published", "updated", "dc:date"]) {
    const raw = textOf(entry[key]).trim();
    if (!raw) continue;
    const time = new Date(raw).getTime();
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return null;
}

function summaryOf(entry: Node): string | null {
  const mediaGroup = first(entry["media:group"]);
  const candidates = [
    entry.description,
    entry.summary,
    entry.content,
    entry["content:encoded"],
    isNode(mediaGroup) ? mediaGroup["media:description"] : undefined,
  ];
  for (const candidate of candidates) {
    const text = plainText(candidate, SUMMARY_MAX);
    if (text) return text;
  }
  return null;
}

function toItem(entry: Node, baseUrl: URL): ParsedFeedItem {
  const url = linkOf(entry.link, baseUrl);
  const title =
    plainText(entry.title, TITLE_MAX) ||
    (url ? new URL(url).hostname : "Untitled");
  return {
    title,
    url,
    publishedAt: dateOf(entry),
    summary: summaryOf(entry),
    raw: entry,
  };
}

function newestFirst(items: ParsedFeedItem[]): ParsedFeedItem[] {
  // Array.prototype.sort is stable, so undated items keep the feed's own order.
  return items.sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return a.publishedAt < b.publishedAt ? 1 : -1;
  });
}

function parseDocument(xml: string): Node {
  try {
    const document: unknown = parser.parse(xml);
    return isNode(document) ? document : {};
  } catch {
    throw new FeedUnavailableError("Not an RSS or Atom feed");
  }
}

export function parseFeed(xml: string, baseUrl: URL): ParsedFeed {
  const document = parseDocument(xml);

  // The three dialects differ only in where the channel and its items live.
  let head: unknown;
  let entries: unknown;
  const rss = document.rss;
  const atom = document.feed;
  const rdf = document["rdf:RDF"];
  if (isNode(rss) && isNode(first(rss.channel))) {
    head = first(rss.channel);
    entries = (head as Node).item;
  } else if (isNode(atom)) {
    head = atom;
    entries = atom.entry;
  } else if (isNode(rdf)) {
    head = first(rdf.channel);
    entries = rdf.item;
  } else {
    throw new FeedUnavailableError("Not an RSS or Atom feed");
  }

  const channel: Node = isNode(head) ? head : {};
  const items = (Array.isArray(entries) ? entries : [])
    .filter(isNode)
    .map((entry) => toItem(entry, baseUrl));

  return {
    title: plainText(channel.title, TITLE_MAX) || null,
    siteUrl: linkOf(channel.link, baseUrl),
    items: newestFirst(items),
  };
}
