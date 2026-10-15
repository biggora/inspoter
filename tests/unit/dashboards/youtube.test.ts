import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearYoutubeCache,
  getYoutubeVideos,
  parseYoutubeChannelInput,
  resolveChannelId,
} from "@/lib/dashboards/feeds/youtube";
import { FeedUnavailableError } from "@/lib/net/feed-fetch";

const ID = "UCabcdefghijklmnopqrstuv";
const OTHER_ID = "UC0123456789abcdefghijkl";

describe("parseYoutubeChannelInput", () => {
  it.each([
    [ID, { type: "id", id: ID }],
    [`  ${ID}  `, { type: "id", id: ID }],
    ["@someone", { type: "handle", handle: "someone" }],
    ["@Some.One_x-1", { type: "handle", handle: "Some.One_x-1" }],
    [`https://www.youtube.com/channel/${ID}`, { type: "id", id: ID }],
    [`youtube.com/channel/${ID}/videos`, { type: "id", id: ID }],
    [`https://m.youtube.com/channel/${ID}?si=abc#top`, { type: "id", id: ID }],
    ["https://www.youtube.com/@someone", { type: "handle", handle: "someone" }],
    ["youtube.com/@someone/videos", { type: "handle", handle: "someone" }],
    [
      "http://youtube.com/@someone?feature=x",
      { type: "handle", handle: "someone" },
    ],
    [
      "https://music.youtube.com/@someone",
      { type: "handle", handle: "someone" },
    ],
    [
      "https://www.youtube.com/%40someone",
      { type: "handle", handle: "someone" },
    ],
    // Unicode handles: bare, as typed in a link, and percent-encoded.
    ["@Иван_Петров", { type: "handle", handle: "Иван_Петров" }],
    ["@Rīgas.Ziņas", { type: "handle", handle: "Rīgas.Ziņas" }],
    ["@a·b", { type: "handle", handle: "a·b" }],
    [
      "https://www.youtube.com/@Иван_Петров",
      { type: "handle", handle: "Иван_Петров" },
    ],
    [
      "youtube.com/@%D0%98%D0%B2%D0%B0%D0%BD_%D0%9F%D0%B5%D1%82%D1%80%D0%BE%D0%B2/videos",
      { type: "handle", handle: "Иван_Петров" },
    ],
    [
      "https://www.youtube.com/c/SomeName",
      { type: "legacy", path: "c/SomeName" },
    ],
    [
      "www.youtube.com/user/some_user/",
      { type: "legacy", path: "user/some_user" },
    ],
  ])("accepts %s", (input, expected) => {
    expect(parseYoutubeChannelInput(input)).toEqual(expected);
  });

  it.each([
    "",
    "   ",
    "someone",
    "@",
    "@ab",
    `@${"x".repeat(31)}`,
    "@bad handle",
    "@bad/handle",
    "@bad<handle>",
    "https://www.youtube.com/@%E0%A4%A",
    "UCshort",
    `${ID}x`,
    "https://evil.com/@someone",
    `https://evil.com/channel/${ID}`,
    "https://youtube.com.evil.com/@someone",
    "https://notyoutube.com/@someone",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/",
    "https://www.youtube.com/channel/UCshort",
    "https://www.youtube.com/playlist?list=PL123",
    "javascript:alert(1)",
    "ftp://www.youtube.com/@someone",
    "https://",
  ])("rejects %j", (input) => {
    expect(parseYoutubeChannelInput(input)).toBeNull();
  });
});

const CHANNEL_PAGE = `<!DOCTYPE html><html><head>
<link rel="canonical" href="https://www.youtube.com/channel/${ID}">
<title>Some channel - YouTube</title></head><body>${"x".repeat(1000)}</body></html>`;

const EXTERNAL_ID_PAGE = `<html><head><title>x</title></head><body><script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"externalId":"${ID}","title":"x"}}};</script></body></html>`;

const META_ID_PAGE = `<html><head><meta itemprop="identifier" content="${ID}"></head></html>`;

function videoEntry(id: string, title: string, published: string, thumb = "") {
  return `<entry>
    <id>yt:video:${id}</id>
    <yt:videoId>${id}</yt:videoId>
    <title>${title}</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/>
    <published>${published}</published>
    ${
      thumb
        ? `<media:group><media:thumbnail url="${thumb}" width="480" height="360"/></media:group>`
        : ""
    }
  </entry>`;
}

function atomFeed(entries: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${ID}"/>
  <title>Some Channel</title>
  <link rel="alternate" href="https://www.youtube.com/channel/${ID}"/>
  ${entries.join("\n")}
</feed>`;
}

const FEED = atomFeed([
  videoEntry(
    "aaaaaaaaaaa",
    "Old video",
    "2024-01-01T00:00:00+00:00",
    "https://i4.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
  ),
  videoEntry("bbbbbbbbbbb", "New video", "2024-02-01T00:00:00+00:00"),
]);

let fetchMock: ReturnType<typeof vi.fn>;

function respond(routes: Record<string, string | number>) {
  fetchMock.mockImplementation(async (input: URL | string) => {
    const url = String(input);
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        return typeof body === "number"
          ? new Response("not here", { status: body })
          : new Response(body);
      }
    }
    throw new Error(`unexpected request to ${url}`);
  });
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  clearYoutubeCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearYoutubeCache();
});

describe("resolveChannelId", () => {
  it("returns a channel id as is, without a request", async () => {
    await expect(resolveChannelId({ type: "id", id: ID })).resolves.toBe(ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the id from the canonical link of the handle page", async () => {
    respond({ "https://www.youtube.com/@someone": CHANNEL_PAGE });

    await expect(
      resolveChannelId({ type: "handle", handle: "someone" }),
    ).resolves.toBe(ID);

    const [, init] = fetchMock.mock.calls[0] as [
      URL,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Cookie).toBe("SOCS=CAI");
    expect(init.headers["Accept-Language"]).toBe("en");
  });

  it("percent-encodes a Unicode handle in the page URL", async () => {
    respond({ "https://www.youtube.com/@": CHANNEL_PAGE });

    await resolveChannelId({ type: "handle", handle: "Иван_Петров" });

    expect(requestedUrls()).toEqual([
      "https://www.youtube.com/@%D0%98%D0%B2%D0%B0%D0%BD_%D0%9F%D0%B5%D1%82%D1%80%D0%BE%D0%B2",
    ]);
  });

  it("falls back to externalId, then to the identifier meta tag", async () => {
    respond({ "https://www.youtube.com/@a": EXTERNAL_ID_PAGE });
    await expect(
      resolveChannelId({ type: "handle", handle: "a1a" }),
    ).resolves.toBe(ID);

    clearYoutubeCache();
    respond({ "https://www.youtube.com/@": META_ID_PAGE });
    await expect(
      resolveChannelId({ type: "handle", handle: "b2b" }),
    ).resolves.toBe(ID);
  });

  it("asks the legacy /c/ and /user/ pages", async () => {
    respond({ "https://www.youtube.com/": CHANNEL_PAGE });

    await resolveChannelId({ type: "legacy", path: "c/SomeName" });
    await resolveChannelId({ type: "legacy", path: "user/some_user" });

    expect(requestedUrls()).toEqual([
      "https://www.youtube.com/c/SomeName",
      "https://www.youtube.com/user/some_user",
    ]);
  });

  it("reports a page without a channel id as not found", async () => {
    respond({
      "https://www.youtube.com/@": "<html><body>nothing</body></html>",
    });

    await expect(
      resolveChannelId({ type: "handle", handle: "nobody" }),
    ).rejects.toThrow("YouTube channel not found");
  });

  it("reports a 404 page as not found", async () => {
    respond({ "https://www.youtube.com/@": 404 });

    const error = await resolveChannelId({
      type: "handle",
      handle: "nobody",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedUnavailableError);
    expect((error as Error).message).toBe("YouTube channel not found");
  });

  it("caches a handle, case-insensitively, and a failure briefly", async () => {
    respond({ "https://www.youtube.com/@": CHANNEL_PAGE });
    await resolveChannelId({ type: "handle", handle: "Someone" });
    await resolveChannelId({ type: "handle", handle: "someone" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respond({ "https://www.youtube.com/@": "<html></html>" });
    const miss = { type: "handle", handle: "nobody" } as const;
    await expect(resolveChannelId(miss)).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
    await expect(resolveChannelId(miss)).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getYoutubeVideos", () => {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ID}`;

  it("maps the channel feed to video tiles, newest first", async () => {
    respond({ [feedUrl]: FEED });

    const channel = await getYoutubeVideos({ type: "id", id: ID });

    expect(channel).toMatchObject({
      channelTitle: "Some Channel",
      channelUrl: `https://www.youtube.com/channel/${ID}`,
      totalCount: 2,
    });
    expect(channel.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(channel.videos).toEqual([
      {
        id: "bbbbbbbbbbb",
        title: "New video",
        url: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
        publishedAt: "2024-02-01T00:00:00.000Z",
        // No thumbnail in the entry: built from the video id.
        thumbnailUrl: "https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg",
      },
      {
        id: "aaaaaaaaaaa",
        title: "Old video",
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        publishedAt: "2024-01-01T00:00:00.000Z",
        thumbnailUrl: "https://i4.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
      },
    ]);
    expect(channel).not.toHaveProperty("showThumbnails");
  });

  it("only trusts https thumbnails on ytimg.com and links on youtube.com", async () => {
    respond({
      [feedUrl]: atomFeed([
        videoEntry(
          "ccccccccccc",
          "Evil thumbnail",
          "2024-03-01T00:00:00Z",
          "https://evil.example.com/t.jpg",
        ),
        videoEntry(
          "ddddddddddd",
          "Plain http thumbnail",
          "2024-02-01T00:00:00Z",
          "http://i.ytimg.com/vi/ddddddddddd/hq.jpg",
        ),
        videoEntry(
          "eeeeeeeeeee",
          "Lookalike host",
          "2024-01-01T00:00:00Z",
          "https://i.ytimg.com.evil.example/t.jpg",
        ),
      ]).replace(
        "https://www.youtube.com/watch?v=ccccccccccc",
        "https://evil.example.com/watch?v=ccccccccccc",
      ),
    });

    const { videos } = await getYoutubeVideos({ type: "id", id: ID });

    expect(videos.map((video) => video.thumbnailUrl)).toEqual([
      "https://i.ytimg.com/vi/ccccccccccc/mqdefault.jpg",
      "https://i.ytimg.com/vi/ddddddddddd/mqdefault.jpg",
      "https://i.ytimg.com/vi/eeeeeeeeeee/mqdefault.jpg",
    ]);
    expect(videos[0].url).toBe("https://www.youtube.com/watch?v=ccccccccccc");
  });

  it("skips entries without a valid video id", async () => {
    respond({
      [feedUrl]: atomFeed([
        videoEntry("short", "Bad id", "2024-03-01T00:00:00Z"),
        videoEntry("fffffffffff", "Good", "2024-02-01T00:00:00Z"),
        `<entry><title>No id at all</title></entry>`,
      ]),
    });

    const channel = await getYoutubeVideos({ type: "id", id: ID });

    expect(channel.videos.map((video) => video.id)).toEqual(["fffffffffff"]);
    expect(channel.totalCount).toBe(1);
  });

  it("resolves a handle first, then reads that channel's feed", async () => {
    respond({
      "https://www.youtube.com/@someone": CHANNEL_PAGE,
      [feedUrl]: FEED,
    });

    const channel = await getYoutubeVideos({
      type: "handle",
      handle: "someone",
    });

    expect(channel.videos).toHaveLength(2);
    expect(requestedUrls()).toEqual([
      "https://www.youtube.com/@someone",
      feedUrl,
    ]);
  });

  it("serves a second call from the cache", async () => {
    respond({ [feedUrl]: FEED });

    await getYoutubeVideos({ type: "id", id: ID });
    await getYoutubeVideos({ type: "id", id: ID });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps channels apart", async () => {
    respond({
      [feedUrl]: FEED,
      [`https://www.youtube.com/feeds/videos.xml?channel_id=${OTHER_ID}`]: FEED,
    });

    await getYoutubeVideos({ type: "id", id: ID });
    await getYoutubeVideos({ type: "id", id: OTHER_ID });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an unknown channel id as not found", async () => {
    respond({ [feedUrl]: 404 });

    await expect(getYoutubeVideos({ type: "id", id: ID })).rejects.toThrow(
      "YouTube channel not found",
    );
  });

  it("reports a response that is not a feed", async () => {
    respond({ [feedUrl]: "<html><body>consent</body></html>" });

    await expect(
      getYoutubeVideos({ type: "id", id: ID }),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
  });
});
