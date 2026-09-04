import {
  computeIndicatorState,
  type IndicatorState,
} from "@/lib/services/indicator-counts";
import { subscribeToIndicatorChanges } from "@/lib/services/indicator-events";

// Sits between the raw event bus and the SSE route so that N connected tabs of
// the same workspace cost ONE recompute per burst, not N. Without this layer
// every tab would run its own copy of the same six COUNT queries on every
// event, and a busy scheduler tick would multiply straight into database load.
//
// It also does the coalescing, which is why the bus itself stays dumb and
// synchronous: debounce logic that owns a timer is far easier to test in
// isolation than one tangled into a ReadableStream.

/** Trailing-edge window. Several writes inside one scheduler tick collapse
 *  into a single recompute and a single frame. */
const COALESCE_MS = 400;

type SnapshotListener = (state: IndicatorState) => void;

interface WorkspaceEntry {
  listeners: Set<SnapshotListener>;
  unsubscribeFromBus: () => void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Last frame actually sent, serialized. Lets an event that changed nothing
   *  the indicators care about (a mail flag sync, say) stop here instead of
   *  waking every open tab. */
  lastJson: string | null;
}

const entries = new Map<string, WorkspaceEntry>();

function flush(workspaceId: string): void {
  const entry = entries.get(workspaceId);
  if (!entry) return;
  entry.timer = null;

  void computeIndicatorState(workspaceId)
    .then((state) => {
      // The entry can disappear while the recompute is in flight.
      const current = entries.get(workspaceId);
      if (!current) return;
      const json = JSON.stringify(state);
      if (json === current.lastJson) return;
      current.lastJson = json;
      for (const listener of current.listeners) {
        try {
          listener(state);
        } catch (error) {
          console.error("[indicator-broadcaster] listener failed:", error);
        }
      }
    })
    .catch((error) => {
      // A failed recompute is not worth tearing the stream down: the next
      // event retries, and the client's safety poll covers a quiet failure.
      console.error("[indicator-broadcaster] recompute failed:", error);
    });
}

function schedule(workspaceId: string): void {
  const entry = entries.get(workspaceId);
  if (!entry || entry.timer) return;
  entry.timer = setTimeout(() => flush(workspaceId), COALESCE_MS);
  // Never hold the process open for a debounce that has no user waiting.
  entry.timer.unref?.();
}

/**
 * Subscribe to recomputed snapshots for one workspace.
 *
 * The returned unsubscribe MUST be called: the last listener to leave tears
 * down the bus subscription and the pending debounce timer. Skipping it leaks
 * a timer plus a listener that keeps issuing database queries for a browser
 * tab that closed.
 */
export function subscribeToIndicatorSnapshots(
  workspaceId: string,
  listener: SnapshotListener,
): () => void {
  let entry = entries.get(workspaceId);
  if (!entry) {
    const created: WorkspaceEntry = {
      listeners: new Set(),
      unsubscribeFromBus: () => {},
      timer: null,
      lastJson: null,
    };
    entries.set(workspaceId, created);
    created.unsubscribeFromBus = subscribeToIndicatorChanges(workspaceId, () =>
      schedule(workspaceId),
    );
    entry = created;
  }
  entry.listeners.add(listener);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = entries.get(workspaceId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    current.unsubscribeFromBus();
    if (current.timer) clearTimeout(current.timer);
    entries.delete(workspaceId);
  };
}

/** Test-only. Never called from application code. */
export function __resetIndicatorBroadcaster(): void {
  for (const entry of entries.values()) {
    entry.unsubscribeFromBus();
    if (entry.timer) clearTimeout(entry.timer);
  }
  entries.clear();
}
