import { env } from "@/lib/config/env";

interface WindowState {
  count: number;
  windowStart: number;
}

const windows = new Map<string, WindowState>();

// The map is keyed by caller-chosen strings (e.g. `${tokenId}:${clientIp}`)
// with no natural cap, so a spoofed-IP attacker could otherwise grow it
// unboundedly. Lazily sweep out expired windows once the map gets large
// instead of running a background timer.
const MAX_TRACKED_KEYS = 10_000;

function evictExpiredWindows(now: number, windowMs: number): void {
  for (const [key, state] of windows) {
    if (now - state.windowStart >= windowMs) {
      windows.delete(key);
    }
  }
}

// Hard cap: even if every tracked key is still within its window (so
// nothing above can be swept as expired), a new key must never be allowed
// to grow the map past MAX_TRACKED_KEYS -- drop the oldest windows first.
function evictOldestWindows(cap: number): void {
  if (windows.size < cap) return;
  const oldestFirst = [...windows.entries()].sort(
    (a, b) => a[1].windowStart - b[1].windowStart,
  );
  const removeCount = windows.size - cap + 1;
  for (let i = 0; i < removeCount; i++) {
    windows.delete(oldestFirst[i][0]);
  }
}

export function checkRateLimit(
  key: string,
  options?: { limit?: number },
): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const limit = options?.limit ?? env.SERVER_METRICS_RATE_LIMIT;
  const windowMs = env.SERVER_METRICS_RATE_WINDOW_MS;

  if (windows.size > MAX_TRACKED_KEYS) {
    evictExpiredWindows(now, windowMs);
  }
  if (windows.size >= MAX_TRACKED_KEYS && !windows.has(key)) {
    evictOldestWindows(MAX_TRACKED_KEYS);
  }

  const state = windows.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count < limit) {
    state.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: state.windowStart + windowMs - now };
}
