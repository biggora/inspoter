import { createFeedCache } from "@/lib/dashboards/feeds/cache";
import { parseFeed } from "@/lib/dashboards/feeds/parse";
import type { RssFeedSnapshot } from "@/lib/dashboards/widget-payloads";
import { FeedUnavailableError, fetchFeedText } from "@/lib/net/feed-fetch";

// The RSS widget's feed: one operator-supplied URL, fetched through the guarded
// fetchFeedText (see src/lib/net/feed-fetch.ts for what a feed URL may reach),
// parsed, and reduced to titles, links, dates and plain-text summaries.
//
// The snapshot carries every item the feed offered; the widget resolver slices
// it to the widget's `limit` and blanks the summaries when they are switched
// off, so two widgets on one feed with different settings share one fetch. The
// parser's raw entry objects are dropped here — only the tile fields are kept.
//
// Cached in-process per URL (see cache.ts): 15 minutes for a good feed, 2 for a
// failing one, concurrent requests for the same URL share one fetch.

const CACHE_TTL_MS = 15 * 60 * 1000;
const ERROR_TTL_MS = 2 * 60 * 1000;

export type { RssFeedSnapshot };

const cache = createFeedCache<RssFeedSnapshot>(CACHE_TTL_MS, ERROR_TTL_MS);

/** Exposed for tests — the cache is process-global and would leak between them. */
export function clearRssCache(): void {
  cache.clear();
}

async function loadFeed(url: URL): Promise<RssFeedSnapshot> {
  const { text, finalUrl } = await fetchFeedText(url);
  const feed = parseFeed(text, finalUrl);
  return {
    feedTitle: feed.title,
    siteUrl: feed.siteUrl ?? finalUrl.origin,
    items: feed.items.map(({ title, url, publishedAt, summary }) => ({
      title,
      url,
      publishedAt,
      summary,
    })),
    totalCount: feed.items.length,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getRssFeed(url: string): Promise<RssFeedSnapshot> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FeedUnavailableError("Feed URL is not valid");
  }
  return cache.get(parsed.toString(), () => loadFeed(parsed));
}
