// Next.js instrumentation hook — runs once when a new server instance boots
// (stable since Next.js 15, no config flag required). Code-review fix
// (Slice 1, minor #1, AC-AUTH-005): src/lib/config/env.ts's fail-fast
// validation must run at server boot, not lazily on first DB access, so a
// misconfigured deployment (missing OPERATOR_USERNAME / neither
// OPERATOR_PASSWORD_HASH nor OPERATOR_PASSWORD) crashes immediately with a
// clear message instead of surfacing as a generic login failure later.
//
// Guarded to the Node.js runtime only — env.ts's schema (DATABASE_URL,
// auth vars, etc.) is server-only config; the Edge runtime (middleware.ts)
// never needs it.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/config/env");
  }
}
