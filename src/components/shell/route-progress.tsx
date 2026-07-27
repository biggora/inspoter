"use client";

/**
 * Route-transition indicator: a 2px bar under the topbar that runs while a
 * navigation is pending.
 *
 * Next's `useLinkStatus` only reports the link it is rendered inside, so the
 * pending state is collected through a context: `NavPending` sits inside each
 * navigation link and reports, `RouteProgressBar` renders the sum. The bar is
 * `aria-hidden` — the loading state is already announced by the destination's
 * `LoadingRegion`, and a second live region would double-speak every
 * navigation.
 */
import { useLinkStatus } from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface RouteProgressContextValue {
  pendingCount: number;
  addPending: () => () => void;
}

const RouteProgressContext = createContext<RouteProgressContextValue | null>(
  null,
);

export function RouteProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendingCount, setPendingCount] = useState(0);

  const addPending = useCallback(() => {
    setPendingCount((count) => count + 1);
    return () => setPendingCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo(
    () => ({ pendingCount, addPending }),
    [pendingCount, addPending],
  );

  return (
    <RouteProgressContext.Provider value={value}>
      {children}
    </RouteProgressContext.Provider>
  );
}

/**
 * Renders nothing; reports its enclosing link's pending state upwards. Must be
 * a child of a `Link` — outside one `useLinkStatus` stays permanently false.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  const context = useContext(RouteProgressContext);
  const addPending = context?.addPending;

  useEffect(() => {
    if (!pending || !addPending) return;
    return addPending();
  }, [pending, addPending]);

  return null;
}

export function RouteProgressBar() {
  const context = useContext(RouteProgressContext);
  const active = (context?.pendingCount ?? 0) > 0;

  if (!active) return null;

  return (
    <div
      data-slot="route-progress"
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
    >
      <div className="animate-route-progress h-full w-full bg-[var(--action-primary)]" />
    </div>
  );
}
