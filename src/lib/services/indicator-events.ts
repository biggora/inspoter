import { EventEmitter } from "node:events";

// Single seam between domain services and anything watching the dashboard
// indicators, mirroring src/lib/services/webhook-events.ts: it imports no
// domain service (and no Prisma, and no React), so the ~13 publish points
// below can't create an import cycle, and the module stays a plain Node object
// that unit tests can drive directly.
//
// Fire-and-forget in the same sense: publishing must never block, never throw,
// and never roll back the domain write that triggered it.
//
// SINGLE-PROCESS DEPENDENCY. This bus is in-memory, so a publish on one Node
// process is invisible to another. The app is deployed as one long-lived
// process (`next start` in Docker, one `app` container in
// docker-compose.prod.yml) and src/lib/services/scheduler.ts already depends on
// exactly that. If this ever runs as several replicas, subscribers on replica A
// will not see replica B's writes; the client's safety poll and focus refetch
// (indicator-store-provider.tsx) are what keep that a latency regression rather
// than a correctness one.

/** What moved. Subscribers currently recompute everything regardless, but the
 *  topic makes publish sites self-documenting and leaves room to narrow the
 *  recompute later without touching every call site. */
export type IndicatorTopic =
  "mail" | "messages" | "alerts" | "calendar" | "providers";

export interface IndicatorChangeEvent {
  workspaceId: string;
  topics: readonly IndicatorTopic[];
  at: number;
}

// Set unconditionally, unlike db.ts's dev-only global cache. Next compiles
// instrumentation.ts (the schedulers) and the route handlers into separate
// module graphs; a module-local emitter would hand the schedulers a different
// bus from the one the SSE route subscribes to and every event would silently
// vanish.
const globalForIndicatorBus = globalThis as unknown as {
  __inspoterIndicatorBus?: EventEmitter;
};

function bus(): EventEmitter {
  const existing = globalForIndicatorBus.__inspoterIndicatorBus;
  if (existing) return existing;
  const created = new EventEmitter();
  // One listener per connected browser tab. The default ceiling of 10 would
  // start printing leak warnings at the 11th tab, which is a normal number of
  // tabs, not a leak.
  created.setMaxListeners(0);
  globalForIndicatorBus.__inspoterIndicatorBus = created;
  return created;
}

// Workspace scoping is the event name rather than a filter inside the
// listener, so an idle workspace costs nothing.
function channel(workspaceId: string): string {
  return `ws:${workspaceId}`;
}

/**
 * Announce that something behind the indicators changed. Synchronous, and
 * safe to call from inside a domain service right after its write commits.
 */
export function publishIndicatorChange(
  workspaceId: string,
  ...topics: IndicatorTopic[]
): void {
  const event: IndicatorChangeEvent = {
    workspaceId,
    topics,
    at: Date.now(),
  };
  try {
    bus().emit(channel(workspaceId), event);
  } catch (error) {
    // Unreachable in practice — listeners are individually guarded at
    // subscribe time — but a publish must never surface to the caller.
    console.error("[indicator-events] publish failed:", error);
  }
}

/**
 * Listen for changes in one workspace. Returns the unsubscribe function.
 *
 * The listener is wrapped here rather than at emit time on purpose:
 * EventEmitter propagates a listener's throw straight out of `.emit()`, which
 * would land in whatever domain write published the event.
 */
export function subscribeToIndicatorChanges(
  workspaceId: string,
  listener: (event: IndicatorChangeEvent) => void,
): () => void {
  const key = channel(workspaceId);
  const guarded = (event: IndicatorChangeEvent) => {
    try {
      listener(event);
    } catch (error) {
      console.error("[indicator-events] listener failed:", error);
    }
  };
  bus().on(key, guarded);
  return () => {
    bus().off(key, guarded);
  };
}

/** Test-only. Never called from application code. */
export function __resetIndicatorBus(): void {
  globalForIndicatorBus.__inspoterIndicatorBus?.removeAllListeners();
  globalForIndicatorBus.__inspoterIndicatorBus = undefined;
}
