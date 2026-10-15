import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns";
import {
  FeedUnavailableError,
  createGuardedLookup,
  fetchFeedText,
  isBlockedFeedAddress,
} from "@/lib/net/feed-fetch";

describe("isBlockedFeedAddress", () => {
  it.each([
    "169.254.169.254",
    "169.254.0.1",
    "fe80::1",
    "0.0.0.0",
    "::",
    "255.255.255.255",
    "224.0.0.1",
    "ff02::1",
    "240.0.0.1",
    "::ffff:169.254.169.254",
    // Metadata endpoints outside link-local.
    "100.100.100.200",
    "fd00:ec2::254",
    "fd20:ce::254",
    "::ffff:100.100.100.200",
    // IPv6 forms that embed an IPv4 address: NAT64 and IPv4-translated.
    "64:ff9b::a9fe:a9fe",
    "64:ff9b::6464:64c8",
    "::ffff:0:a9fe:a9fe",
  ])("blocks %s in both modes", (ip) => {
    expect(isBlockedFeedAddress(ip, false)).toBe(true);
    expect(isBlockedFeedAddress(ip, true)).toBe(true);
  });

  it.each([
    "192.168.1.10",
    "10.0.0.5",
    "172.16.0.9",
    "127.0.0.1",
    "::1",
    "fd00::1",
    "100.64.0.1",
    "::ffff:127.0.0.1",
    "fec0::1",
    "64:ff9b::a00:5",
    "64:ff9b::7f00:1",
  ])("allows %s unless private addresses are blocked", (ip) => {
    expect(isBlockedFeedAddress(ip, false)).toBe(false);
    expect(isBlockedFeedAddress(ip, true)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "allows the public address %s",
    (ip) => {
      expect(isBlockedFeedAddress(ip, false)).toBe(false);
      expect(isBlockedFeedAddress(ip, true)).toBe(false);
    },
  );

  it("blocks anything that is not an IP address", () => {
    expect(isBlockedFeedAddress("not-an-ip", false)).toBe(true);
    expect(isBlockedFeedAddress("", false)).toBe(true);
  });
});

describe("createGuardedLookup", () => {
  const dnsLookup = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;

  function resolveTo(...addresses: string[]) {
    dnsLookup.mockImplementation((...args: unknown[]) => {
      const callback = args[2] as (...a: unknown[]) => void;
      callback(
        null,
        addresses.map((address) => ({
          address,
          family: address.includes(":") ? 6 : 4,
        })),
      );
    });
  }

  function run(blockPrivate: boolean, all: boolean) {
    return new Promise<{ error: unknown; result: unknown }>((resolve) => {
      const guarded = createGuardedLookup(blockPrivate) as unknown as (
        host: string,
        options: { all: boolean },
        callback: (error: unknown, ...rest: unknown[]) => void,
      ) => void;
      guarded("feed.example", { all }, (error, ...rest) =>
        resolve({ error, result: rest }),
      );
    });
  }

  beforeEach(() => {
    dnsLookup.mockReset();
  });

  it("passes a public address through, as a list when asked for all", async () => {
    resolveTo("93.184.216.34");
    const { error, result } = await run(false, true);
    expect(error).toBeNull();
    expect(result).toEqual([[{ address: "93.184.216.34", family: 4 }]]);
  });

  it("returns a single address and family otherwise", async () => {
    resolveTo("93.184.216.34");
    const { error, result } = await run(false, false);
    expect(error).toBeNull();
    expect(result).toEqual(["93.184.216.34", 4]);
  });

  it("refuses a hostname that resolves to the metadata address", async () => {
    resolveTo("169.254.169.254");
    const { error } = await run(false, true);
    expect(error).toBeInstanceOf(FeedUnavailableError);
  });

  it("refuses when any one of several addresses is blocked", async () => {
    resolveTo("93.184.216.34", "169.254.169.254");
    const { error } = await run(false, true);
    expect(error).toBeInstanceOf(FeedUnavailableError);
  });

  it("allows a LAN address by default and refuses it when private is blocked", async () => {
    resolveTo("192.168.1.10");
    expect((await run(false, true)).error).toBeNull();
    expect((await run(true, true)).error).toBeInstanceOf(FeedUnavailableError);
  });
});

describe("fetchFeedText", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const options = { blockPrivate: false };

  it("returns the body text and the final URL", async () => {
    fetchMock.mockResolvedValue(new Response("<rss/>", { status: 200 }));

    const result = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    );

    expect(result.text).toBe("<rss/>");
    expect(result.finalUrl.href).toBe("https://example.com/feed.xml");
  });

  it("sends the feed headers, manual redirects and no cache", async () => {
    fetchMock.mockResolvedValue(new Response("x"));

    await fetchFeedText(new URL("https://example.com/feed.xml"), {
      ...options,
      headers: { Cookie: "SOCS=CAI" },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      headers: Record<string, string>;
    };
    expect(init.redirect).toBe("manual");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // The DNS guard lives in this agent; without it the request is unchecked.
    expect((init as { dispatcher?: unknown }).dispatcher).toBeDefined();
    expect(init.headers["User-Agent"]).toBe("Inspoter-Feeds/1");
    expect(init.headers.Accept).toContain("application/rss+xml");
    expect(init.headers.Cookie).toBe("SOCS=CAI");
  });

  it("decodes the charset the server declares", async () => {
    fetchMock.mockResolvedValue(
      new Response(Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), {
        headers: { "content-type": "text/xml; charset=windows-1251" },
      }),
    );

    const { text } = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    );

    expect(text).toBe("Привет");
  });

  it("reads the charset from the XML prolog when the header has none", async () => {
    const prolog = Buffer.from('<?xml version="1.0" encoding="windows-1251"?>');
    const body = Buffer.concat([
      prolog,
      Buffer.from("<t>"),
      Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]),
      Buffer.from("</t>"),
    ]);
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { "content-type": "text/xml" } }),
    );

    const { text } = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    );

    expect(text).toContain("<t>Привет</t>");
  });

  it("falls back to UTF-8 for an unknown prolog encoding", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '<?xml version="1.0" encoding="no-such-charset"?><t>Привет</t>',
      ),
    );

    const { text } = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    );

    expect(text).toContain("<t>Привет</t>");
  });

  it("rejects non-http protocols", async () => {
    await expect(
      fetchFeedText(new URL("ftp://example.com/feed.xml"), options),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    await expect(
      fetchFeedText(new URL("file:///etc/passwd"), options),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a metadata IP literal before any request is made", async () => {
    await expect(
      fetchFeedText(
        new URL("http://169.254.169.254/latest/meta-data"),
        options,
      ),
    ).rejects.toThrow("Feed host is not allowed");
    await expect(
      fetchFeedText(new URL("http://[fe80::1]/feed"), options),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a private IP literal only when private addresses are not blocked", async () => {
    fetchMock.mockResolvedValue(new Response("<rss/>"));

    await expect(
      fetchFeedText(new URL("http://192.168.1.10/feed"), {
        blockPrivate: false,
      }),
    ).resolves.toMatchObject({ text: "<rss/>" });
    await expect(
      fetchFeedText(new URL("http://192.168.1.10/feed"), {
        blockPrivate: true,
      }),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a non-2xx response by status only", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>secret internal page</html>", { status: 503 }),
    );

    const error = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedUnavailableError);
    expect((error as FeedUnavailableError).message).toBe(
      "Feed responded with 503",
    );
    expect((error as FeedUnavailableError).status).toBe(503);
  });

  it("rejects a body larger than 2 MB", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1)));

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed is larger than 2 MB");
  });

  it("rejects a declared length above 2 MB without reading the body", async () => {
    fetchMock.mockResolvedValue(
      new Response("tiny", {
        headers: { "content-length": String(3 * 1024 * 1024) },
      }),
    );

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed is larger than 2 MB");
  });

  it("follows a relative redirect", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/new.xml" } }),
      )
      .mockResolvedValueOnce(new Response("<rss/>"));

    const result = await fetchFeedText(
      new URL("https://example.com/old.xml"),
      options,
    );

    expect(result.finalUrl.href).toBe("https://example.com/new.xml");
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://example.com/new.xml",
    );
  });

  it("gives up after three redirects", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(null, { status: 302, headers: { location: "/next" } }),
    );

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed redirected too many times");
    // The original request plus three followed redirects.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("re-validates every redirect hop", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed host is not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "ftp://example.com/feed.xml" },
      }),
    );
    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toBeInstanceOf(FeedUnavailableError);
  });

  it("does not forward caller headers to another origin", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://other.example.org/feed" },
        }),
      )
      .mockResolvedValueOnce(new Response("<rss/>"));

    await fetchFeedText(new URL("https://example.com/feed.xml"), {
      ...options,
      headers: { Cookie: "SOCS=CAI" },
    });

    const first = fetchMock.mock.calls[0][1] as { headers: object };
    const second = fetchMock.mock.calls[1][1] as { headers: object };
    expect(first.headers).toHaveProperty("Cookie");
    expect(second.headers).not.toHaveProperty("Cookie");
  });

  it("turns a network failure into a short FeedUnavailableError", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new Error("ECONNREFUSED 10.0.0.1"),
      }),
    );

    const error = await fetchFeedText(
      new URL("https://example.com/feed.xml"),
      options,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedUnavailableError);
    expect((error as Error).message).toBe("Could not reach the feed host");
  });

  it("surfaces the DNS guard's refusal that undici wraps in fetch failed", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new FeedUnavailableError("Feed host is not allowed"),
      }),
    );

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed host is not allowed");
  });

  it("reports a timeout", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation timed out", "TimeoutError"),
    );

    await expect(
      fetchFeedText(new URL("https://example.com/feed.xml"), options),
    ).rejects.toThrow("Feed request timed out");
  });
});
