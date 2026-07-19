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
// Reentrancy note: when handleI18nRouting() rewrites an unprefixed
// default-locale path (e.g. "/login") to its internal locale-prefixed form
// ("/ru/login"), Next.js's proxy re-runs this whole function again for that
// rewritten path, because it still matches `config.matcher` below. On that
// second pass, next-intl's own canonicalization logic sees an
// explicitly-prefixed default-locale path (localePrefix: "as-needed" means
// the default locale should NOT be prefixed) and issues a *real*,
// client-visible 307 redirect back to "/login" — which the browser follows,
// re-triggering the same rewrite, forever. To break this loop, once a
// pathname is already locale-prefixed we skip calling handleI18nRouting a
// second time and just continue: the resolved locale header it set on the
// first pass is already present on the re-entrant request, so
// next-intl/server's requestLocale() still resolves correctly downstream.

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

function isLocalePrefixed(pathname: string): boolean {
  return routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const response =
    isApiRoute || isLocalePrefixed(pathname)
      ? NextResponse.next()
      : handleI18nRouting(request);

  const localizedPathname = stripLocalePrefix(pathname);
  const isAuthExempt =
    localizedPathname === "/login" ||
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
