// Datetime formatting for operator-facing tables and timelines. Consolidates
// the per-view copies that had drifted apart (activity, alerts, logs, webhook
// deliveries/settings) behind named formats, so a timestamp means the same
// thing everywhere it renders:
//
//   formatDate          — "17.02.2026" (locale date, day-first)
//   formatDateTime      — locale date + time, seconds optional
//   formatShortDateTime — "17.02 14:03:55" (activity rows: date implied by page context)
//   formatClockTime     — "14:03:55.482" (log lines: the ms are the point)
//
// next-intl `format.dateTime` callers (services, messages) are deliberately
// NOT migrated here: those follow the active app locale rather than the
// browser locale, which is a different (stricter) contract.

function toDate(value: string | null | undefined): Date | null | string {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date || typeof date === "string") return date ?? "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(
  value: string | null | undefined,
  { seconds = false }: { seconds?: boolean } = {},
): string {
  const date = toDate(value);
  if (!date || typeof date === "string") return date ?? "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(seconds ? { second: "2-digit" as const } : {}),
  });
}

export function formatShortDateTime(value: string): string {
  const date = toDate(value);
  if (!date || typeof date === "string") return date ?? value;
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}.${month} ${time}`;
}

export function formatClockTime(value: string): string {
  const date = toDate(value);
  if (!date || typeof date === "string") return date ?? value;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${time}.${pad(date.getMilliseconds(), 3)}`;
}
