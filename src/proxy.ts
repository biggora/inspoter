import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Optimistic auth proxy (architecture.md §5.3, ADR-003), composed with
// next-intl's locale-routing middleware. Cheap cookie-presence check
// only — no DB work here; the authoritative check is requireOperator() in
// src/lib/auth/dal.ts.
//
// Ordering matters: locale negotiation must run BEFORE the auth check, since
// every page now lives under src/app/[locale]/**. Redirecting an
// unauthenticated request to a bare "/login" would 404 if next-intl hadn't
// already rewritten the request to its localized segment.
//
// /api/** is explicitly excluded from the next-intl rewrite: there is no
// src/app/[locale]/api/ folder, so running requests through
// handleI18nRouting would rewrite them into a path that doesn't exist and
// 404 internally. /api/** still needs the auth check below (matching prior
// behavior) — it's just routed straight to NextResponse.next() instead of
// through the locale middleware.
//
// /login now lives inside [locale]/, so it must go through the locale
// rewrite like any other page, but it stays exempt from the auth redirect
// itself (AC-AUTH-001 exception, NFR-SEC-001, C-2), as do
// /api/auth/authentik/:path* (Authentik login-initiation/callback — reached
// before any session cookie exists), /api/webhooks/:path*,
// /api/discord/webhooks/:path*, /api/server-metrics, /api/mcp and
// /api/v1/:path* (the token-authenticated agent API). The last five
// authenticate with an API token (bearer header or tokenized path) and never
// carry a session cookie, so without the exemption they
// would be redirected to /login instead of reaching their handler. Renamed from
// middleware.ts to proxy.ts for Next.js 16 (the `middleware` file/export
// convention is deprecated); proxy runs on the Node.js runtime, which is
// sufficient for this cookie-only redirect.
//
// handleI18nRouting always runs for non-API routes (no bypass for
// already-prefixed paths): with two locales, an explicitly-prefixed
// default-locale URL like "/en/hosting" (e.g. produced by the language
// switcher's cross-locale `router.replace`) must still reach next-intl so it
// can issue its canonicalizing 307 to the unprefixed "/hosting" — skipping
// it here would leave "/en/*" permanently un-canonicalized. An earlier
// version of this file skipped handleI18nRouting for any already-prefixed
// pathname, out of a concern that internal rewrites of unprefixed
// default-locale paths (e.g. "/login") would re-enter this function and
// redirect-loop. That re-entrancy was verified empirically not to occur
// under Next.js 16's proxy invocation model (a middleware rewrite response
// does not cause proxy() to run again for the rewritten pathname) — repeated
// and redirect-following requests to "/login" complete cleanly with a single
// 200 and zero redirects.

const SESSION_COOKIE_NAME = "session";
const handleI18nRouting = createMiddleware(routing);

/**
 * next-intl's middleware re-syncs the locale cookie to the locale of whatever
 * URL it is asked for. That is right for a page load but wrong for a fetch()
 * (a <Link> prefetch, a soft navigation, a refresh), which can be a stale
 * request for the page being left. The language switcher writes the new locale
 * to the cookie client-side, then navigates; prefetches of the old locale's
 * pages are still in flight, and their `/ru/...` responses landed mid-
 * navigation, set the cookie back to "ru", and the redirect chain for the
 * unprefixed default-locale URL (the only form whose locale comes from the
 * cookie) bounced to `/ru/...`.
 *
 * Next.js strips its own RSC/prefetch headers and the `_rsc` param before the
 * proxy runs, so the one signal left is the browser's `Sec-Fetch-Dest`:
 * "empty" for fetch(), "document" for a page load. The fetch still resolves its
 * locale from the cookie as before; it just can't write it. Soft locale
 * changes already write the cookie on the client (next-intl's
 * `syncLocaleCookie`), and a page load still writes it here.
 *
 * The locale cookie is the only cookie next-intl's middleware writes, and
 * Next.js carries a response cookie in both `set-cookie` and its internal
 * `x-middleware-set-cookie` header, so both are dropped.
 */
function dropLocaleCookieWrite(response: NextResponse): void {
  response.headers.delete("set-cookie");
  response.headers.delete("x-middleware-set-cookie");
}

function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

/**
 * The `/<locale>` the request spelled out, or "" when it used the unprefixed
 * default-locale form. The login redirect below carries it so an operator who
 * asked for a specific locale is not silently bounced into whichever one their
 * browser prefers.
 */
function localePrefixOf(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return `/${locale}`;
    }
  }
  return "";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const response = isApiRoute
    ? NextResponse.next()
    : handleI18nRouting(request);
  if (request.headers.get("sec-fetch-dest") === "empty") {
    dropLocaleCookieWrite(response);
  }

  const localizedPathname = stripLocalePrefix(pathname);
  const isAuthExempt =
    localizedPathname === "/" ||
    localizedPathname === "/login" ||
    pathname === "/api/server-metrics" ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/auth/authentik") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/discord/webhooks");
  if (isAuthExempt) return response;

  if (request.cookies.has(SESSION_COOKIE_NAME)) return response;

  const loginUrl = new URL(`${localePrefixOf(pathname)}/login`, request.url);
  loginUrl.searchParams.set("next", localizedPathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
