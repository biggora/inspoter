import { env } from "@/lib/config/env";

interface WindowState {
  count: number;
  windowStart: number;
}

// Two separate pools so per-IP eviction pressure can never reset a
// per-token ceiling window: without this split, an attacker filling the
// "ip" pool up to its cap (e.g. via spoofed x-forwarded-for values, one
// per request, each individually within the ceiling) could evict a
// "token" pool entry as its oldest window and bypass the ceiling by
// resetting its count.
const ipWindows = new Map<string, WindowState>();
const tokenWindows = new Map<string, WindowState>();

// Only the "ip" pool has no natural cap (a spoofed-IP attacker can mint
// unlimited keys) and needs a hard eviction cap. The "token" pool is
// bounded by the number of real authenticated tokens, so it only needs
// the cheap expired-window sweep.
const MAX_TRACKED_IP_KEYS = 10_000;

function evictExpiredWindows(
  map: Map<string, WindowState>,
  now: number,
  windowMs: number,
): void {
  for (const [key, state] of map) {
    if (now - state.windowStart >= windowMs) {
      map.delete(key);
    }
  }
}

// Hard cap: even if every tracked key is still within its window (so
// nothing above can be swept as expired), a new key must never be allowed
// to grow the map past the cap -- drop the oldest windows first.
function evictOldestWindows(map: Map<string, WindowState>, cap: number): void {
  if (map.size < cap) return;
  const oldestFirst = [...map.entries()].sort(
    (a, b) => a[1].windowStart - b[1].windowStart,
  );
  const removeCount = map.size - cap + 1;
  for (let i = 0; i < removeCount; i++) {
    map.delete(oldestFirst[i][0]);
  }
}

export function checkRateLimit(
  key: string,
  options?: { limit?: number; pool?: "ip" | "token" },
): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const limit = options?.limit ?? env.SERVER_METRICS_RATE_LIMIT;
  const windowMs = env.SERVER_METRICS_RATE_WINDOW_MS;
  const pool = options?.pool ?? "ip";
  const map = pool === "token" ? tokenWindows : ipWindows;

  if (pool === "ip") {
    if (map.size > MAX_TRACKED_IP_KEYS) {
      evictExpiredWindows(map, now, windowMs);
    }
    if (map.size >= MAX_TRACKED_IP_KEYS && !map.has(key)) {
      evictOldestWindows(map, MAX_TRACKED_IP_KEYS);
    }
  } else {
    evictExpiredWindows(map, now, windowMs);
  }

  const state = map.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    map.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count < limit) {
    state.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: state.windowStart + windowMs - now };
}
