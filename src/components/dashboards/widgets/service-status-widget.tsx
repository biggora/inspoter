"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { StatusIndicator } from "@/components/ui/status-indicator";
import type { ServiceStatusPayload } from "@/lib/dashboards/widget-payloads";

// Monitoring summary. The counts cover every selected service, while the list
// shows the ones that fit — down first, so a tile cropped to three rows still
// leads with what is broken.
//
// Status wording and colour come from StatusIndicator, the app's single status
// vocabulary, so a monitor reads the same here as on the Services page.

export function ServiceStatusWidget({ data }: { data: ServiceStatusPayload }) {
  const t = useTranslations("dashboards");

  if (data.totalCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("serviceStatus.empty")}
      </p>
    );
  }

  const hidden = data.totalCount - data.services.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("serviceStatus.summaryUp", { count: data.summary.up })}</span>
        <span>
          {t("serviceStatus.summaryDown", { count: data.summary.down })}
        </span>
        {data.summary.pending > 0 && (
          <span>
            {t("serviceStatus.summaryPending", {
              count: data.summary.pending,
            })}
          </span>
        )}
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {data.services.map((service) => (
          <li key={service.id} className="min-w-0">
            <Link
              href={`/services/${service.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
            >
              <span className="min-w-0 truncate text-foreground-800">
                {service.name}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {service.lastResponseTimeMs !== null && (
                  <span className="tabular-nums text-muted-foreground">
                    {t("serviceStatus.responseTime", {
                      value: service.lastResponseTimeMs,
                    })}
                  </span>
                )}
                <StatusIndicator
                  status={
                    !service.isActive
                      ? "disabled"
                      : service.status === "UP"
                        ? "up"
                        : service.status === "DOWN"
                          ? "down"
                          : "pending"
                  }
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("serviceStatus.moreCount", { count: hidden })}
        </p>
      )}
    </div>
  );
}
