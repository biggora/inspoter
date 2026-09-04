// Client-side store for every dashboard indicator, transport-agnostic.
//
// A module singleton plus useSyncExternalStore, the idiom this codebase
// already uses for external state (src/hooks/use-mobile.ts,
// dashboards/widgets/clock-widget.tsx). It replaces the old window-event bus
// in notifications-api.ts, which only ever reached the topbar: the sidebar
// footer and the management page read server props from a layout App Router
// does not re-render on client-side navigation, so they went stale and
// disagreed with each other on screen.
//
// SSR SAFETY: this module is a singleton shared by the Node process across
// concurrent requests — the same hazard documented in
// src/lib/client/active-workspace.ts. Every mutator below is a no-op on the
// server, and getServerSnapshot() returns a constant, never module state.

import { useSyncExternalStore } from "react";

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface IndicatorStateDto {
  mail: number;
  alerts: number;
  messages: number;
  calendar: number;
  providersOk: number;
  providersErrored: number;
  openCriticalAlerts: number;
}

interface StoreState {
  workspaceId: string | null;
  indicators: IndicatorStateDto;
}

let state: StoreState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

// Referential stability is what keeps useSyncExternalStore from looping: the
// store swaps one whole object and hands back that same reference until the
// numbers actually change.
function getSnapshot(): StoreState | null {
  return state;
}

// A constant, never module state. This is what prevents one request's numbers
// leaking into another's SSR output, and what makes the hydration render agree
// with the server render.
function getServerSnapshot(): null {
  return null;
}

function sameNumbers(a: IndicatorStateDto, b: IndicatorStateDto): boolean {
  return (
    a.mail === b.mail &&
    a.alerts === b.alerts &&
    a.messages === b.messages &&
    a.calendar === b.calendar &&
    a.providersOk === b.providersOk &&
    a.providersErrored === b.providersErrored &&
    a.openCriticalAlerts === b.openCriticalAlerts
  );
}

/**
 * Accept a payload from any transport. Ignores anything addressed to a
 * workspace the tab has already moved off, and stays silent when nothing
 * changed — otherwise a poll returning identical numbers would re-render the
 * whole shell on every tick.
 */
export function applyIndicators(
  workspaceId: string,
  indicators: IndicatorStateDto,
): void {
  if (typeof window === "undefined") return;
  if (state && state.workspaceId !== workspaceId) return;
  if (state && sameNumbers(state.indicators, indicators)) return;
  state = { workspaceId, indicators };
  emit();
}

/**
 * Seed from the server-rendered values. Called during render (guarded, like
 * setActiveWorkspaceId in app-sidebar.tsx) so the first client snapshot equals
 * what the server painted — that is what keeps the badges correct on first
 * paint instead of popping in after hydration.
 */
export function seedIndicators(
  workspaceId: string,
  indicators: IndicatorStateDto,
): void {
  if (typeof window === "undefined") return;
  if (state?.workspaceId === workspaceId) return;
  state = { workspaceId, indicators };
  emit();
}

/** Drop everything on a workspace switch, so no stale number survives it. */
export function resetIndicators(workspaceId: string, seed: IndicatorStateDto) {
  if (typeof window === "undefined") return;
  state = { workspaceId, indicators: seed };
  emit();
}

export async function fetchIndicators(): Promise<IndicatorStateDto> {
  const res = await fetch("/api/indicators", {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error(`Indicator request failed: ${res.status}`);
  return (await res.json()) as IndicatorStateDto;
}

/**
 * One-shot refetch. Replaces notifyUnreadCountsStale(): a section that just
 * marked rows read calls this so its badge clears immediately rather than on
 * the next tick. The server publishes the same change to the SSE stream, but
 * keeping the client nudge means the UX is identical when SSE is unavailable.
 */
export async function refreshIndicators(): Promise<void> {
  if (typeof window === "undefined") return;
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return;
  try {
    applyIndicators(workspaceId, await fetchIndicators());
  } catch {
    // A failed refresh keeps the last known numbers; the stream or the next
    // safety poll corrects them.
  }
}

/** Fire-and-forget form for call sites that are not async. */
export function invalidateIndicators(): void {
  void refreshIndicators();
}

/**
 * Read the current indicators. Falls back to the server-rendered seed until
 * the store is populated, which is what makes the first paint correct.
 */
export function useIndicators(seed: IndicatorStateDto): IndicatorStateDto {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return snapshot?.indicators ?? seed;
}

/** Test-only. Never called from application code. */
export function __resetIndicatorStore(): void {
  state = null;
  listeners.clear();
}
