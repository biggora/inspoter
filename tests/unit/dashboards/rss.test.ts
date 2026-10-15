import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearRssCache, getRssFeed } from "@/lib/dashboards/feeds/rss";
import { FeedUnavailableError } from "@/lib/net/feed-fetch";

const URL_ = "https://example.com/feed.xml";

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example</title>
  <link>https://example.com/</link>
  <item><title>One</title><link>https://example.com/1</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><description>First</description></item>
  <item><title>Two</title><link>https://example.com/2</link><pubDate>Tue, 02 Jan 2024 10:00:00 GMT</pubDate></item>
  <item><title>Three</title></item>
</channel></rss>`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearRssCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearRssCache();
});

function ok(body = FEED) {
  fetchMock.mockImplementation(async () => new Response(body));
}

describe("getRssFeed", () => {
  it("returns every item of the feed as a tile", async () => {
    ok();

    const snapshot = await getRssFeed(URL_);

    expect(snapshot).toMatchObject({
      feedTitle: "Example",
      siteUrl: "https://example.com/",
      totalCount: 3,
      fetchedAt: "2024-06-01T12:00:00.000Z",
    });
    expect(snapshot.items).toEqual([
      {
        title: "Two",
        url: "https://example.com/2",
        publishedAt: "2024-01-02T10:00:00.000Z",
        summary: null,
      },
      {
        title: "One",
        url: "https://example.com/1",
        publishedAt: "2024-01-01T10:00:00.000Z",
        summary: "First",
      },
      { title: "Three", url: null, publishedAt: null, summary: null },
    ]);
  });

  it("does not carry the parser's raw entries into the snapshot", async () => {
    ok();

    const snapshot = await getRssFeed(URL_);

    for (const item of snapshot.items) {
      expect(Object.keys(item).sort()).toEqual([
        "publishedAt",
        "summary",
        "title",
        "url",
      ]);
    }
  });

  it("falls back to the origin of the final URL for the site link", async () => {
    ok(`<rss version="2.0"><channel><title>No link</title></channel></rss>`);

    const snapshot = await getRssFeed("https://feeds.example.org/a/b.xml");

    expect(snapshot.siteUrl).toBe("https://feeds.example.org");
  });

  it("serves a second call from the cache until it expires", async () => {
    ok();

    await getRssFeed(URL_);
    await getRssFeed(URL_);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2024-06-01T12:14:59Z"));
    await getRssFeed(URL_);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2024-06-01T12:15:01Z"));
    await getRssFeed(URL_);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats URLs that normalise to the same address as one feed", async () => {
    ok();

    await getRssFeed("https://EXAMPLE.com/feed.xml");
    await getRssFeed("https://example.com/feed.xml");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a failure for two minutes and rethrows it", async () => {
    fetchMock.mockImplementation(
      async () => new Response("down", { status: 503 }),
    );

    await expect(getRssFeed(URL_)).rejects.toThrow("Feed responded with 503");
    vi.setSystemTime(new Date("2024-06-01T12:01:59Z"));
    const again = await getRssFeed(URL_).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(FeedUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The feed recovers, and the next attempt after the error TTL sees it.
    ok();
    vi.setSystemTime(new Date("2024-06-01T12:02:01Z"));
    await expect(getRssFeed(URL_)).resolves.toMatchObject({ totalCount: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a body that is not a feed", async () => {
    ok("<html><body>login required</body></html>");

    await expect(getRssFeed(URL_)).rejects.toThrow("Not an RSS or Atom feed");
  });

  it("rejects a URL that cannot be parsed", async () => {
    await expect(getRssFeed("not a url")).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares one fetch between concurrent requests", async () => {
    ok();

    const [a, b] = await Promise.all([getRssFeed(URL_), getRssFeed(URL_)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("keeps different feeds apart", async () => {
    ok();

    await getRssFeed(URL_);
    await getRssFeed("https://example.com/other.xml");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches again after clearRssCache", async () => {
    ok();

    await getRssFeed(URL_);
    clearRssCache();
    await getRssFeed(URL_);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
