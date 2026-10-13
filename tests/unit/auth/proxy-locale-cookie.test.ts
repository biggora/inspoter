import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

// next-intl's middleware answers a request whose URL locale differs from the
// NEXT_LOCALE cookie with a Set-Cookie that overwrites it. For a page load
// that is right; for a stale fetch() (a <Link> prefetch of the page being
// left) it resets the cookie the language switcher just wrote and bounces the
// navigation back to the old locale. The proxy must drop that write for
// `Sec-Fetch-Dest: empty` requests only.

function request(secFetchDest?: string): NextRequest {
  const headers = new Headers({ cookie: "NEXT_LOCALE=en" });
  if (secFetchDest) headers.set("sec-fetch-dest", secFetchDest);
  // /ru/login is exempt from the auth redirect, so the response is next-intl's.
  return new NextRequest("http://localhost/ru/login", { headers });
}

function localeCookieWrites(response: Response): string[] {
  return [
    response.headers.get("set-cookie"),
    response.headers.get("x-middleware-set-cookie"),
  ].filter((value): value is string => !!value?.includes("NEXT_LOCALE"));
}

describe("proxy locale cookie sync", () => {
  it("does not let a fetch rewrite the locale cookie", () => {
    const response = proxy(request("empty"));

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-set-cookie")).toBeNull();
    expect(localeCookieWrites(response)).toEqual([]);
  });

  it.each([["document"], [undefined]])(
    "still writes the locale cookie for a page load (Sec-Fetch-Dest: %s)",
    (secFetchDest) => {
      const response = proxy(request(secFetchDest));

      expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=ru");
      expect(response.headers.get("x-middleware-set-cookie")).toContain(
        "NEXT_LOCALE=ru",
      );
    },
  );
});
