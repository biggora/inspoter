import * as React from "react";

// Breakpoint standardized to `lg`/1024px (design.md v1.1 §3.2.1/§3.2.2/§7,
// M-2 doc-review fix) — below this width the shell's Sidebar renders as an
// off-canvas Sheet instead of the persistent inline sidebar.
const MOBILE_BREAKPOINT = 1024;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// SSR / pre-hydration snapshot: match the previous hook's initial `!!undefined`
// (i.e. not-mobile) so hydration output is stable until the client measures.
function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
