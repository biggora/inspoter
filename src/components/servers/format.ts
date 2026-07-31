// Formatting and status vocabulary shared by servers-view.tsx and
// server-detail-view.tsx. Extracted from servers-view.tsx when the detail page
// needed the same uptime wording and the same status mapping — a card and the
// page it opens must not disagree on what "running" is called.

import type { StatusState } from "@/components/ui/status-indicator";
import type { ServerStatus } from "@/lib/providers/servers/types";
import type { MetricsState } from "./api";

export function formatUptime(seconds: bigint): string {
  const totalMinutes = Number(seconds) / 60;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = Math.floor(totalMinutes % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Provider power states mapped onto the app-wide status vocabulary — the
// indicator supplies colour, wording, and pulse (ui/status-indicator.tsx).
export const statusState: Record<ServerStatus, StatusState> = {
  running: "up",
  stopped: "stopped",
  starting: "starting",
  stopping: "stopping",
  restarting: "restarting",
  unknown: "unknown",
};

export const metricsState: Record<MetricsState, StatusState> = {
  live: "up",
  stale: "stale",
  not_configured: "notConfigured",
};
