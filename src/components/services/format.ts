// Small formatting helpers shared by services-view.tsx, service-detail-view.tsx
// and service-form-dialog.tsx. The relative-time bucketing itself lives in
// @/lib/format/relative-time (shared with messages/message-timeline.tsx); this
// module only adds the services-specific "never checked"/invalid-date
// fallbacks around it.

import {
  formatRelativeTime as formatRelativeTimeBucketed,
  type Format,
} from "@/lib/format/relative-time";
import type { MonitorTypeValue } from "./api";

// HTTP(S) and Ping are protocol names, not Russian prose, so they stay as
// plain literal strings. TCP-порт contains the actual Russian word "порт"
// ("port") and does need translation — its value here is a translation key,
// resolved via getMonitorTypeLabel() below (same "store the key in the map,
// resolve with t() at render" convention as servers-view.tsx's statusConfig).
export const MONITOR_TYPE_LABELS: Record<MonitorTypeValue, string> = {
  HTTP: "HTTP(S)",
  TCP: "monitorTypeTcp",
  PING: "Ping",
};

export function getMonitorTypeLabel(
  monitorType: MonitorTypeValue,
  t: (key: string) => string,
): string {
  return monitorType === "TCP"
    ? t(MONITOR_TYPE_LABELS.TCP)
    : MONITOR_TYPE_LABELS[monitorType];
}

export function formatTarget(service: {
  monitorType: MonitorTypeValue;
  url?: string | null;
  host?: string | null;
  port?: number | null;
}): string {
  switch (service.monitorType) {
    case "HTTP":
      return service.url ?? "—";
    case "TCP":
      return service.host
        ? `${service.host}${service.port ? `:${service.port}` : ""}`
        : "—";
    case "PING":
      return service.host ?? "—";
    default:
      return "—";
  }
}

export function formatRelativeTime(
  value: string | Date | null,
  t: (key: string, params?: Record<string, number>) => string,
  format: Format,
): string {
  if (!value) return t("neverChecked");
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return formatRelativeTimeBucketed(d, t, format);
}

export function formatResponseTime(
  ms: number | null,
  t: (key: string, params?: Record<string, number>) => string,
): string {
  if (ms === null || ms === undefined) return "—";
  return t("msValue", { value: ms });
}

export function formatDateTime(value: string | Date, format: Format): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format.dateTime(d, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
