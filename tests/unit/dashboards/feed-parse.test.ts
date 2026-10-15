import { describe, expect, it } from "vitest";

import { parseFeed } from "@/lib/dashboards/feeds/parse";
import { FeedUnavailableError } from "@/lib/net/feed-fetch";

const base = new URL("https://example.com/feeds/main.xml");

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Blog</title>
    <link>https://example.com/</link>
    <atom:link href="https://example.com/feed" rel="self" type="application/rss+xml"/>
    <item>
      <title>Older post</title>
      <link>https://example.com/older</link>
      <pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate>
      <description>Plain summary</description>
    </item>
    <item>
      <title>Newer post</title>
      <link>https://example.com/newer</link>
      <pubDate>Wed, 03 Jan 2024 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Hello <b>world</b> &amp; friends</p><script>alert(1)</script>]]></description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom Feed</title>
  <link rel="self" href="https://example.com/atom.xml"/>
  <link rel="alternate" href="https://example.com/"/>
  <entry>
    <title type="html">First &amp;amp; best</title>
    <link rel="enclosure" href="https://example.com/file.mp3"/>
    <link rel="alternate" href="/posts/1"/>
    <published>2024-02-01T12:00:00Z</published>
    <updated>2024-02-02T12:00:00Z</updated>
    <summary>Short summary</summary>
  </entry>
  <entry>
    <title>Second</title>
    <link href="https://example.com/posts/2"/>
    <updated>2024-02-03T12:00:00+02:00</updated>
    <content type="html">&lt;p&gt;Body &lt;em&gt;text&lt;/em&gt;&lt;/p&gt;</content>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.org/">
    <title>RDF Feed</title>
    <link>https://example.org/</link>
  </channel>
  <item rdf:about="https://example.org/a">
    <title>RDF item</title>
    <link>https://example.org/a</link>
    <description>RDF description</description>
    <dc:date>2024-03-01T00:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

const YOUTUBE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv"/>
  <id>yt:channel:abcdefghijklmnopqrstuv</id>
  <yt:channelId>abcdefghijklmnopqrstuv</yt:channelId>
  <title>Some Channel</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"/>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Never Gonna</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <published>2024-04-01T00:00:00+00:00</published>
    <media:group>
      <media:title>Never Gonna</media:title>
      <media:thumbnail url="https://i2.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
      <media:description>A very long description</media:description>
    </media:group>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads an RSS 2.0 feed, newest first", () => {
    const feed = parseFeed(RSS, base);

    expect(feed.title).toBe("Example Blog");
    expect(feed.siteUrl).toBe("https://example.com/");
    expect(feed.items.map((item) => item.title)).toEqual([
      "Newer post",
      "Older post",
    ]);
    expect(feed.items[1]).toMatchObject({
      url: "https://example.com/older",
      publishedAt: "2024-01-01T10:00:00.000Z",
      summary: "Plain summary",
    });
  });

  it("strips markup from a summary, drops scripts and decodes entities", () => {
    const [newest] = parseFeed(RSS, base).items;

    expect(newest.summary).toBe("Hello world & friends");
  });

  it("reads an Atom feed with alternate links and html titles", () => {
    const feed = parseFeed(ATOM, base);

    expect(feed.title).toBe("Atom Feed");
    expect(feed.siteUrl).toBe("https://example.com/");
    // Sorted by date: the +02:00 entry is the newest.
    expect(feed.items.map((item) => item.title)).toEqual([
      "Second",
      "First & best",
    ]);
    const [second, first] = feed.items;
    expect(first.url).toBe("https://example.com/posts/1");
    expect(first.publishedAt).toBe("2024-02-01T12:00:00.000Z");
    expect(first.summary).toBe("Short summary");
    expect(second.url).toBe("https://example.com/posts/2");
    expect(second.publishedAt).toBe("2024-02-03T10:00:00.000Z");
    expect(second.summary).toBe("Body text");
  });

  it("reads an RSS 1.0 (RDF) feed", () => {
    const feed = parseFeed(RDF, base);

    expect(feed.title).toBe("RDF Feed");
    expect(feed.siteUrl).toBe("https://example.org/");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      title: "RDF item",
      url: "https://example.org/a",
      publishedAt: "2024-03-01T00:00:00.000Z",
      summary: "RDF description",
    });
  });

  it("keeps the raw entry so the YouTube module can read its fields", () => {
    const feed = parseFeed(YOUTUBE, base);

    expect(feed.title).toBe("Some Channel");
    expect(feed.siteUrl).toBe(
      "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
    );
    const [video] = feed.items;
    expect(video.raw["yt:videoId"]).toBe("dQw4w9WgXcQ");
    expect(video.raw["media:group"]).toMatchObject({
      "media:thumbnail": { "@_url": expect.stringContaining("ytimg.com") },
    });
    expect(video.summary).toBe("A very long description");
  });

  it("does not expand DOCTYPE entities recursively (billion laughs)", () => {
    const entities = ['<!ENTITY lol0 "lol">'];
    for (let i = 1; i <= 9; i++) {
      entities.push(`<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`);
    }
    const xml = `<?xml version="1.0"?>
<!DOCTYPE lolz [${entities.join("\n")}]>
<rss version="2.0"><channel><title>&lol9;</title>
<item><title>&lol9;</title><description>&lol9;</description></item>
</channel></rss>`;

    const feed = parseFeed(xml, base);

    // Entities are not expanded recursively: the reference stays as written, so
    // the 10^9 repetitions of "lol" never materialise.
    expect(feed.title).toBe("&lol9;");
    expect(feed.items[0].title).toBe("&lol9;");
  });

  it("refuses a document whose entities expand past the length cap", () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE l [<!ENTITY a "${"x".repeat(900)}">]>
<rss version="2.0"><channel><title>t</title>${"<item><title>&a;</title></item>".repeat(300)}</channel></rss>`;

    expect(() => parseFeed(xml, base)).toThrow(FeedUnavailableError);
  });

  it("parses a feed that escapes its HTML with hundreds of standard entities", () => {
    // Regression: a cap on the number of entity expansions also counted the
    // ordinary &lt; / &amp;, so GitHub, Reddit or Mastodon feeds were rejected.
    const items = Array.from(
      { length: 300 },
      (_, i) => `<item>
        <title>Q&amp;A &quot;${i}&quot;</title>
        <description>&lt;p&gt;Hello &lt;b&gt;bold&lt;/b&gt; &amp;amp; more&lt;/p&gt;</description>
      </item>`,
    ).join("\n");
    const xml = `<rss version="2.0"><channel><title>R&amp;D</title>${items}</channel></rss>`;

    const feed = parseFeed(xml, base);

    expect(feed.title).toBe("R&D");
    expect(feed.items).toHaveLength(300);
    expect(feed.items[0].title).toBe('Q&A "0"');
    expect(feed.items[299].summary).toBe("Hello bold & more");
  });

  it("parses one description holding hundreds of escaped tags", () => {
    const body = "&lt;b&gt;x&lt;/b&gt; ".repeat(300);
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>a</title><description>&lt;p&gt;${body}&lt;/p&gt;</description></item>
    </channel></rss>`;

    const summary = parseFeed(xml, base).items[0].summary ?? "";

    expect(summary.startsWith("x x x")).toBe(true);
    expect(summary).toHaveLength(300);
    expect(summary).not.toContain("<");
  });

  it("does not read external entities", () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<rss version="2.0"><channel><title>&xxe;</title></channel></rss>`;

    let title = "";
    try {
      title = parseFeed(xml, base).title ?? "";
    } catch (error) {
      // Refusing the document outright is as good as not expanding it.
      expect(error).toBeInstanceOf(FeedUnavailableError);
    }

    expect(title).not.toContain("root:");
  });

  it("accepts a legacy RSS 0.91 DOCTYPE that only references a DTD", () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//EN" "http://my.netscape.com/publish/formats/rss-0.91.dtd">
<rss version="0.91"><channel><title>Old</title><item><title>a</title></item></channel></rss>`;

    expect(parseFeed(xml, base).items).toHaveLength(1);
  });

  it("nulls links that are not http or https", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>a</title><link>javascript:alert(1)</link></item>
      <item><title>b</title><link>data:text/html,hi</link></item>
      <item><title>c</title><link>ftp://example.com/x</link></item>
    </channel></rss>`;

    const urls = parseFeed(xml, base).items.map((item) => item.url);

    expect(urls).toEqual([null, null, null]);
  });

  it("resolves relative links against the feed URL", () => {
    const xml = `<rss version="2.0"><channel><title>T</title><link>/</link>
      <item><title>a</title><link>/posts/1</link></item>
      <item><title>b</title><link>2</link></item>
    </channel></rss>`;

    const feed = parseFeed(xml, base);

    expect(feed.siteUrl).toBe("https://example.com/");
    expect(feed.items.map((item) => item.url)).toEqual([
      "https://example.com/posts/1",
      "https://example.com/feeds/2",
    ]);
  });

  it("turns an unparseable date into null", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>a</title><pubDate>last tuesday-ish</pubDate></item>
    </channel></rss>`;

    expect(parseFeed(xml, base).items[0].publishedAt).toBeNull();
  });

  it("truncates a long summary to 300 characters", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>a</title><description><![CDATA[<div>${"word ".repeat(200)}</div>]]></description></item>
    </channel></rss>`;

    const summary = parseFeed(xml, base).items[0].summary ?? "";

    expect(summary).toHaveLength(300);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary).not.toContain("<");
  });

  it("returns null for an empty summary", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>a</title><description><![CDATA[<p> </p><img src="x.png">]]></description></item>
    </channel></rss>`;

    expect(parseFeed(xml, base).items[0].summary).toBeNull();
  });

  it("keeps undated items after dated ones in feed order", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>undated 1</title></item>
      <item><title>old</title><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
      <item><title>undated 2</title></item>
      <item><title>new</title><pubDate>Wed, 03 Jan 2024 10:00:00 GMT</pubDate></item>
    </channel></rss>`;

    expect(parseFeed(xml, base).items.map((item) => item.title)).toEqual([
      "new",
      "old",
      "undated 1",
      "undated 2",
    ]);
  });

  it("falls back to the link host, then 'Untitled', for a missing title", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><link>https://news.example.org/a</link></item>
      <item><description>no title, no link</description></item>
    </channel></rss>`;

    expect(parseFeed(xml, base).items.map((item) => item.title)).toEqual([
      "news.example.org",
      "Untitled",
    ]);
  });

  it("accepts a channel with no items", () => {
    const feed = parseFeed(
      `<rss version="2.0"><channel><title>Empty</title></channel></rss>`,
      base,
    );

    expect(feed).toMatchObject({ title: "Empty", items: [] });
  });

  it.each([
    ["HTML", "<!doctype html><html><body><h1>Hello</h1></body></html>"],
    ["other XML", `<?xml version="1.0"?><note><to>Me</to></note>`],
    ["plain text", "just some words"],
    ["empty", ""],
  ])("rejects %s as not a feed", (_label, body) => {
    expect(() => parseFeed(body, base)).toThrow(FeedUnavailableError);
    expect(() => parseFeed(body, base)).toThrow("Not an RSS or Atom feed");
  });
});
