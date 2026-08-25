export interface FixedWindowResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterMs?: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

export class BoundedFixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();
  private lastSweepAt = 0;

  constructor(
    private readonly maxKeys = 10_000,
    private readonly sweepIntervalMs = 60_000,
  ) {}

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): FixedWindowResult {
    if (now - this.lastSweepAt >= this.sweepIntervalMs) {
      for (const [trackedKey, state] of this.windows) {
        if (now - state.windowStart >= windowMs) {
          this.windows.delete(trackedKey);
        }
      }
      this.lastSweepAt = now;
    }

    let state = this.windows.get(key);
    if (!state || now - state.windowStart >= windowMs) {
      if (!state && this.windows.size >= this.maxKeys) {
        const oldestKey = this.windows.keys().next().value;
        if (oldestKey !== undefined) this.windows.delete(oldestKey);
      }
      state = { count: 1, windowStart: now };
      this.windows.set(key, state);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetAtMs: now + windowMs,
      };
    }

    const resetAtMs = state.windowStart + windowMs;
    if (state.count < limit) {
      state.count += 1;
      return {
        allowed: true,
        limit,
        remaining: limit - state.count,
        resetAtMs,
      };
    }
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAtMs,
      retryAfterMs: Math.max(0, resetAtMs - now),
    };
  }

  size(): number {
    return this.windows.size;
  }
}
