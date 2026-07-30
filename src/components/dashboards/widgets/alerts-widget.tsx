"use client";

import { useTranslations } from "next-intl";

import { SeverityBadge } from "@/components/alerts/severity-badge";
import type { AlertsPayload } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// Latest alerts. The severity chip is the Alerts section's own SeverityBadge, so
// the four-tier scale keeps one set of colours and wording across the product.
export function AlertsWidget({ data }: { data: AlertsPayload }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  if (data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("alerts.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {data.items.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5 text-xs">
          <span className="flex items-center gap-1.5">
            <SeverityBadge severity={item.severity} />
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
