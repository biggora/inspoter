// Open-redirect guard for post-login `next` targets. Only same-origin,
// single-leading-slash relative paths are ever honored — used by the
// Authentik login-initiation/callback routes (the `next` value round-trips
// through a cookie an attacker could tamper with) and reusable by the
// password-login form.
//
// The fallback is the Dashboards section: it is the workspace overview and the
// first sidebar entry, and it forwards to the start dashboard (or to the "create
// your first one" state) on its own.

const DUMMY_ORIGIN = "http://dummy.invalid";

/** Where a sign-in lands when no explicit `next` target was supplied. */
export const POST_LOGIN_PATH = "/dashboards";

export function sanitizeNextPath(
  next: string | null | undefined,
  fallback = POST_LOGIN_PATH,
): string {
  if (!next) return fallback;

  // Reject protocol-relative ("//host") and backslash tricks ("/\host") up
  // front — some URL parsers treat a leading backslash as a slash, which
  // would otherwise turn this into a protocol-relative redirect.
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(next, DUMMY_ORIGIN);
    if (resolved.origin !== DUMMY_ORIGIN) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
