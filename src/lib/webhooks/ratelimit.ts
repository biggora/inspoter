import { env } from "@/lib/config/env";
import { BoundedFixedWindowLimiter } from "@/lib/rate-limit/fixed-window";

// In-process fixed-window rate limiter, keyed by tokenId (architecture.md
// §3.5, ADR-006). Single-instance deployment (HC-2) => one in-memory Map is
// the global counter; no shared store needed. Resets on process restart and
// isn't shared across replicas — accepted limitation (R-4).

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  // Window bookkeeping, needed by the Discord-compatible route to emit
  // X-RateLimit-* on every response (specs/discord-webhook-compatibility.md §5).
  limit: number;
  remaining: number;
  resetAtMs: number;
}

const limiter = new BoundedFixedWindowLimiter();

export function checkRateLimit(tokenId: string): RateLimitResult {
  return limiter.consume(
    tokenId,
    env.WEBHOOK_RATE_LIMIT,
    env.WEBHOOK_RATE_WINDOW_MS,
  );
}
