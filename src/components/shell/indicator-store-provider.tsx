"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";

import {
  applyIndicators,
  fetchIndicators,
  resetIndicators,
  seedIndicators,
  useIndicators as useIndicatorsWithSeed,
  type IndicatorStateDto,
} from "./indicator-store";

// Mounted once in the dashboard layout, outside the {children} slot — the same
// placement WebMcpGlobalTools uses, and for the same reason: it must survive
// client-side navigation. That is precisely what the sidebar footer lacked,
// since App Router never re-renders a layout on a soft navigation.

const ZERO: IndicatorStateDto = {
  mail: 0,
  alerts: 0,
  messages: 0,
  calendar: 0,
  providersOk: 0,
  providersErrored: 0,
  openCriticalAlerts: 0,
};

interface IndicatorSeed {
  indicators: IndicatorStateDto;
  // The workspace the seed belongs to. The store only answers for the
  // workspace it is labelled with, so a tree rendered for another one keeps
  // showing its own seed until the store has been relabelled on commit.
  workspaceId?: string;
}

// Carries the immutable server-rendered seed. Live values never travel through
// context — they come from the module store — so a change wakes only the
// components that read the store, not the whole subtree.
const IndicatorSeedContext = createContext<IndicatorSeed>({
  indicators: ZERO,
});

/**
 * The seed alone, with no transport. IndicatorStoreProvider wraps this; tests
 * and stories use it directly to render a consumer at a known state without
 * opening an EventSource.
 */
export function IndicatorSeedProvider({
  value,
  workspaceId,
  children,
}: {
  value: IndicatorStateDto;
  workspaceId?: string;
  children: ReactNode;
}) {
  const seed = useMemo(
    () => ({ indicators: value, workspaceId }),
    [value, workspaceId],
  );
  return (
    <IndicatorSeedContext.Provider value={seed}>
      {children}
    </IndicatorSeedContext.Provider>
  );
}

/** Every consumer reads through this: store first, server seed until it fills. */
export function useIndicators(): IndicatorStateDto {
  const { indicators, workspaceId } = useContext(IndicatorSeedContext);
  return useIndicatorsWithSeed(indicators, workspaceId);
}

// Safety net, not the primary transport. It covers a dropped stream, an event
// that never fired, and a future multi-replica deployment where the in-process
// bus cannot reach this process. Slower while the stream is healthy.
const POLL_LIVE_MS = 120_000;
const POLL_OFFLINE_MS = 30_000;

// Browsers cap HTTP/1.1 at six connections per origin. Six dashboard tabs each
// holding a stream open would deadlock navigation on the seventh request, so a
// backgrounded tab gives its connection back and picks a fresh one up (with an
// immediate catch-up fetch) when the operator returns to it.
const IDLE_DISCONNECT_MS = 60_000;

export function IndicatorStoreProvider({
  workspaceId,
  initial,
  children,
}: {
  workspaceId: string;
  initial: IndicatorStateDto;
  children: ReactNode;
}) {
  // Label the store with this workspace and its server numbers on commit, not
  // during render: a render React may never commit (or one that precedes the
  // unmount of the previous workspace's tree) must not change what the tree
  // still on screen reads, nor notify its subscribers mid-render. Until then
  // consumers show `initial` through the seed context, so the first paint
  // already has the server's numbers and the badges never flash zero.
  useLayoutEffect(() => {
    seedIndicators(workspaceId, initial);
    // `initial` is a fresh object on every layout render; see the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    resetIndicators(workspaceId, initial);

    let disposed = false;
    let source: EventSource | null = null;
    let live = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    async function pull(): Promise<boolean> {
      try {
        const next = await fetchIndicators(workspaceId);
        if (!disposed) applyIndicators(workspaceId, next);
        return true;
      } catch {
        // A failed pull keeps the last known numbers.
        return false;
      }
    }

    function startPoll() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(
        () => {
          if (document.visibilityState !== "visible") return;
          void pull();
        },
        live ? POLL_LIVE_MS : POLL_OFFLINE_MS,
      );
    }

    function disconnect() {
      source?.close();
      source = null;
      live = false;
      startPoll();
    }

    function connect() {
      if (disposed || source) return;
      const stream = new EventSource(
        `/api/indicators/stream?workspace=${encodeURIComponent(workspaceId)}`,
      );
      source = stream;
      stream.addEventListener("state", (event) => {
        if (disposed) return;
        try {
          applyIndicators(
            workspaceId,
            JSON.parse((event as MessageEvent<string>).data),
          );
        } catch {
          // A malformed frame is not worth dropping the connection over.
        }
      });
      stream.onopen = () => {
        live = true;
        startPoll();
      };
      stream.onerror = () => {
        // EventSource reconnects on its own using the server's `retry:`.
        live = false;
        startPoll();
      };
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        void pull();
        connect();
        return;
      }
      // Give the connection back if the tab stays in the background.
      idleTimer = setTimeout(disconnect, IDLE_DISCONNECT_MS);
    }

    function onFocus() {
      void pull();
    }

    // Fetch before connecting. EventSource cannot read a status code, so a tab
    // whose operator is no longer a member of this workspace would retry a 403
    // every five seconds forever. A plain fetch surfaces that, and we simply
    // do not open the stream.
    void pull().then((ok) => {
      if (disposed) return;
      startPoll();
      if (ok && document.visibilityState === "visible") connect();
    });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      source?.close();
      source = null;
    };
    // `initial` is a fresh object on every layout render, but the layout only
    // re-renders on a hard load or router.refresh() — both of which carry
    // genuinely fresh server data — so keying on the workspace alone is right.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <IndicatorSeedProvider value={initial} workspaceId={workspaceId}>
      {children}
    </IndicatorSeedProvider>
  );
}
