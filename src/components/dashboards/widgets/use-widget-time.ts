"use client";

import { useFormatter, useTranslations } from "next-intl";

import { formatRelativeTime } from "@/lib/format/relative-time";

/**
 * "3 min ago" for the three list widgets (mail, alerts, logs), using the shared
 * bucketing helper with the dashboards namespace's own wording. Each widget
 * would otherwise wire up the same translator plus formatter pair itself.
 */
export function useWidgetRelativeTime(): (isoString: string) => string {
  const t = useTranslations("dashboards");
  const format = useFormatter();
  return (isoString: string) =>
    formatRelativeTime(new Date(isoString), t, format);
}
