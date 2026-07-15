// Small formatting helpers shared by services-view.tsx, service-detail-view.tsx
// and service-form-dialog.tsx. No new date library — same relative-time
// bucketing already used by src/components/messages/messages-view.tsx's
// formatMessageTime (Простота: reuse, don't add a dependency).

import type { MonitorTypeValue } from "./api";

export const MONITOR_TYPE_LABELS: Record<MonitorTypeValue, string> = {
  HTTP: "HTTP(S)",
  TCP: "TCP-порт",
  PING: "Ping",
};

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

export function formatRelativeTime(value: string | Date | null): string {
  if (!value) return "Ещё не проверялся";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function formatResponseTime(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  return `${ms} мс`;
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
