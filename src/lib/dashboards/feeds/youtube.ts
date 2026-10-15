import { createFeedCache } from "@/lib/dashboards/feeds/cache";
import { first, parseFeed } from "@/lib/dashboards/feeds/parse";
import {
  parseYoutubeChannelInput,
  type YoutubeChannelRef,
} from "@/lib/dashboards/feeds/youtube-input";
import type {
  YoutubeChannelSnapshot,
  YoutubeVideoTile,
} from "@/lib/dashboards/widget-payloads";
import { FeedUnavailableError, fetchFeedText } from "@/lib/net/feed-fetch";

// The YouTube widget's videos, read from the channel's public Atom feed
// (youtube.com/feeds/videos.xml) — no API key, no quota, no embed. The only
// hosts this module ever asks for are youtube.com's, and both requests go
// through the same guarded fetchFeedText as the RSS widget.
//
// The feed is keyed by channel ID, but operators paste links and @handles, so a
// handle is first resolved by reading the channel page and picking the ID out of
// its canonical link. That page is the one fragile step: if YouTube changes the
// markup the lookup fails with "channel not found", and pasting the UC… ID
// keeps working. Handles rarely change owner, so the mapping is cached a day.
//
// Links and thumbnails are re-derived rather than trusted: a video URL is kept
// only on a youtube.com host, a thumbnail only on *.ytimg.com, and either falls
// back to the URL built from the video ID.

const VIDEOS_TTL_MS = 15 * 60 * 1000;
const HANDLE_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 2 * 60 * 1000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_PATTERNS = [
  /<link\s[^>]*?rel="canonical"[^>]*?href="https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w-]{22})"/,
  /"externalId":"(UC[\w-]{22})"/,
  /<meta\s+itemprop="identifier"\s+content="(UC[\w-]{22})"/,
];
const NOT_FOUND = "YouTube channel not found";

export { parseYoutubeChannelInput };
export type { YoutubeChannelRef };

/** What the cache holds; the resolver adds `showThumbnails` from the widget. */
export type YoutubeChannelFeed = Omit<YoutubeChannelSnapshot, "showThumbnails">;

const videosCache = createFeedCache<YoutubeChannelFeed>(
  VIDEOS_TTL_MS,
  ERROR_TTL_MS,
);
const channelIdCache = createFeedCache<string>(HANDLE_TTL_MS, ERROR_TTL_MS);

/** Exposed for tests — the caches are process-global and would leak between them. */
export function clearYoutubeCache(): void {
  videosCache.clear();
  channelIdCache.clear();
}

// The feed and the channel page both answer 404 for something that is not a
// channel; say that instead of "Feed responded with 404".
function asNotFound(error: unknown): unknown {
  return error instanceof FeedUnavailableError && error.status === 404
    ? new FeedUnavailableError(NOT_FOUND)
    : error;
}

function pagePath(ref: Exclude<YoutubeChannelRef, { type: "id" }>): string {
  return ref.type === "handle"
    ? `@${encodeURIComponent(ref.handle)}`
    : ref.path.split("/").map(encodeURIComponent).join("/");
}

async function lookupChannelId(path: string): Promise<string> {
  let text: string;
  try {
    ({ text } = await fetchFeedText(
      new URL(`https://www.youtube.com/${path}`),
      {
        // SOCS=CAI is the "consent given" cookie; without it an EU server is
        // sent to a consent page that has no channel markup.
        headers: { Cookie: "SOCS=CAI", "Accept-Language": "en" },
      },
    ));
  } catch (error) {
    throw asNotFound(error);
  }
  for (const pattern of CHANNEL_ID_PATTERNS) {
    const id = pattern.exec(text)?.[1];
    if (id) return id;
  }
  throw new FeedUnavailableError(NOT_FOUND);
}

export async function resolveChannelId(
  ref: YoutubeChannelRef,
): Promise<string> {
  if (ref.type === "id") return ref.id;
  const path = pagePath(ref);
  return channelIdCache.get(path.toLowerCase(), () => lookupChannelId(path));
}

function isYoutubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
}

function isYtimgHost(hostname: string): boolean {
  return hostname === "ytimg.com" || hostname.endsWith(".ytimg.com");
}

/** The URL when it is https on an accepted host, else null. */
function onHost(
  raw: unknown,
  accept: (hostname: string) => boolean,
): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && accept(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function child(node: unknown, key: string): unknown {
  return typeof node === "object" && node !== null
    ? first((node as Record<string, unknown>)[key])
    : undefined;
}

function thumbnailOf(raw: Record<string, unknown>, videoId: string): string {
  const thumbnail = child(child(raw, "media:group"), "media:thumbnail");
  return (
    onHost(child(thumbnail, "@_url"), isYtimgHost) ??
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
  );
}

async function loadVideos(channelId: string): Promise<YoutubeChannelFeed> {
  let fetched: Awaited<ReturnType<typeof fetchFeedText>>;
  try {
    fetched = await fetchFeedText(
      new URL(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      ),
    );
  } catch (error) {
    throw asNotFound(error);
  }

  const feed = parseFeed(fetched.text, fetched.finalUrl);
  const videos: YoutubeVideoTile[] = [];
  for (const item of feed.items) {
    const id = child(item.raw, "yt:videoId");
    if (typeof id !== "string" || !VIDEO_ID.test(id)) continue;
    videos.push({
      id,
      title: item.title,
      url:
        onHost(item.url, isYoutubeHost) ??
        `https://www.youtube.com/watch?v=${id}`,
      publishedAt: item.publishedAt,
      thumbnailUrl: thumbnailOf(item.raw, id),
    });
  }

  return {
    channelTitle: feed.title,
    channelUrl:
      onHost(feed.siteUrl, isYoutubeHost) ??
      `https://www.youtube.com/channel/${channelId}`,
    videos,
    totalCount: videos.length,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getYoutubeVideos(
  ref: YoutubeChannelRef,
): Promise<YoutubeChannelFeed> {
  const channelId = await resolveChannelId(ref);
  return videosCache.get(channelId, () => loadVideos(channelId));
}
