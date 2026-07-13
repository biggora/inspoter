import { env } from "@/lib/config/env";

// In-process fixed-window rate limiter, keyed by tokenId (architecture.md
// §3.5, ADR-006). Single-instance deployment (HC-2) => one in-memory Map is
// the global counter; no shared store needed. Resets on process restart and
// isn't shared across replicas — accepted limitation (R-4).

interface WindowState {
  count: number;
  windowStart: number;
}

const windows = new Map<string, WindowState>();

export function checkRateLimit(tokenId: string): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const limit = env.WEBHOOK_RATE_LIMIT;
  const windowMs = env.WEBHOOK_RATE_WINDOW_MS;

  const state = windows.get(tokenId);
  if (!state || now - state.windowStart >= windowMs) {
    windows.set(tokenId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count < limit) {
    state.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: state.windowStart + windowMs - now };
}
