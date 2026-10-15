import { FeedUnavailableError } from "@/lib/net/feed-fetch";

// The in-process cache both feed widgets share: a TTL per outcome, plus
// in-flight de-duplication. A dashboard polls every minute and several widgets
// (or several browsers) may point at the same feed, so one upstream request
// serves them all. Failures are cached too, for a shorter time — a feed that is
// down should not be hammered once a minute by every open dashboard, but should
// be retried soon after it recovers.
//
// Per-process and non-persistent, like the weather cache: losing it on restart
// costs one request per feed. Only FeedUnavailableError is cached; anything
// else is a bug and should surface every time.

/** A safety bound, not a tuning knob: an operator can add many feed widgets. */
const MAX_ENTRIES = 200;

type Entry<T> =
  | { ok: true; value: T; expiresAt: number }
  | { ok: false; error: FeedUnavailableError; expiresAt: number };

export interface FeedCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createFeedCache<T>(
  successTtlMs: number,
  errorTtlMs: number,
): FeedCache<T> {
  const entries = new Map<string, Entry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  function remember(key: string, entry: Entry<T>): void {
    entries.set(key, entry);
    if (entries.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [k, e] of entries) if (e.expiresAt <= now) entries.delete(k);
    // Map iterates in insertion order, so the first key is the oldest.
    while (entries.size > MAX_ENTRIES) {
      entries.delete(entries.keys().next().value as string);
    }
  }

  return {
    async get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        if (hit.ok) return hit.value;
        throw hit.error;
      }

      const pending = inFlight.get(key);
      if (pending) return pending;

      const request = load()
        .then(
          (value) => {
            remember(key, {
              ok: true,
              value,
              expiresAt: Date.now() + successTtlMs,
            });
            return value;
          },
          (error: unknown) => {
            if (error instanceof FeedUnavailableError) {
              remember(key, {
                ok: false,
                error,
                expiresAt: Date.now() + errorTtlMs,
              });
            }
            throw error;
          },
        )
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    },
    clear() {
      entries.clear();
      inFlight.clear();
    },
  };
}
