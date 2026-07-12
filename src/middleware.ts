import { NextResponse, type NextRequest } from "next/server";

// Optimistic auth middleware (architecture.md §5.3, ADR-003). Cheap
// cookie-presence check only — no DB work here (Edge-constrained); the
// authoritative check is requireOperator() in src/lib/auth/dal.ts. Matcher
// excludes /login, /api/webhooks/:path* (AC-AUTH-001 exception, NFR-SEC-001,
// C-2), and static assets.

const SESSION_COOKIE_NAME = "session";

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/webhooks|_next/static|_next/image|favicon.ico).*)"],
};
