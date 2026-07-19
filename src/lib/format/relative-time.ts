// Generic relative-time bucketing ("just now" / "N minutes ago" / "N hours
// ago" / "N days ago", falling back to a formatted date past a week) shared
// by any area that needs it. Extracted from components/services/format.ts so
// components/messages/message-timeline.tsx (a later commit) can reuse the
// exact same logic instead of duplicating it.
//
// This module has no i18n namespace of its own: callers pass their own
// namespace's `t` for the bucket strings, plus a next-intl `Format` (from
// useFormatter()/getFormatter()) for the date fallback.

import type { useFormatter } from "next-intl";

export type Format = ReturnType<typeof useFormatter>;

export function formatRelativeTime(
  date: Date,
  t: (key: string, params?: Record<string, number>) => string,
  format: Format,
): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return t("justNow");
  if (diffMins < 60) return t("minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("daysAgo", { count: diffDays });

  return format.dateTime(date, { day: "numeric", month: "short" });
}
