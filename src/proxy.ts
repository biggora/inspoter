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
// before any session cookie exists) and /api/webhooks/:path*. Renamed from
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

function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const response = isApiRoute
    ? NextResponse.next()
    : handleI18nRouting(request);

  const localizedPathname = stripLocalePrefix(pathname);
  const isAuthExempt =
    localizedPathname === "/login" ||
    pathname === "/api/server-metrics" ||
    pathname.startsWith("/api/auth/authentik") ||
    pathname.startsWith("/api/webhooks");
  if (isAuthExempt) return response;

  if (request.cookies.has(SESSION_COOKIE_NAME)) return response;

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", localizedPathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
