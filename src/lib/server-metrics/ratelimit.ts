import { env } from "@/lib/config/env";

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
  const limit = env.SERVER_METRICS_RATE_LIMIT;
  const windowMs = env.SERVER_METRICS_RATE_WINDOW_MS;

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
