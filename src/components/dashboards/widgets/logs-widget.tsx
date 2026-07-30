"use client";

import { useTranslations } from "next-intl";

import { SeverityBadge } from "@/components/alerts/severity-badge";
import type { LogsPayload } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// Latest log entries. The level chip reuses SeverityBadge: it is documented as
// the shared four-tier scale (design.md §2.5) and log levels are that same
// scale — the Logs page's private LevelBadge maps the identical variants.
export function LogsWidget({ data }: { data: LogsPayload }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  if (data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("logs.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {data.items.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5 text-xs">
          <span className="flex items-center gap-1.5">
            <SeverityBadge severity={item.level} />
            <span className="min-w-0 flex-1 truncate text-foreground-800">
              {item.message}
            </span>
          </span>
          <span className="truncate text-muted-foreground">
            {item.source} · {relativeTime(item.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  );
}
