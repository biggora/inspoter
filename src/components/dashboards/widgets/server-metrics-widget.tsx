"use client";

import { useTranslations } from "next-intl";

import { MetricRow, MetricRows } from "@/components/ui/metric-row";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { UsageMeter } from "@/components/ui/usage-meter";
import { usageFromTotals } from "@/lib/format/bytes";
import type { ServerMetricsPayload } from "@/lib/dashboards/widget-payloads";

// CPU, memory, and disk per server, from the agent snapshots. Rows reuse the
// section's MetricRow/UsageMeter pair and the shared byte formatting, so the
// numbers and the meters read exactly as they do on the Servers page.
//
// A server with no snapshot (agent never installed) or a stale one still gets a
// row: "no metrics" is information about that server, not a reason to hide it.

export function ServerMetricsWidget({ data }: { data: ServerMetricsPayload }) {
  const t = useTranslations("dashboards");

  if (data.totalCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("serverMetrics.empty")}
      </p>
    );
  }

  const hidden = data.totalCount - data.servers.length;

  return (
    <div className="flex h-full flex-col gap-3">
      {data.servers.map((server) => {
        const metrics = server.metrics;
        const memory = usageFromTotals(
          metrics.memoryTotalBytes,
          metrics.memoryAvailableBytes,
        );
        const disk = usageFromTotals(
          metrics.filesystemTotalBytes,
          metrics.filesystemAvailableBytes,
        );
        const cpuPercent =
          metrics.cpuUsagePercent === null
            ? null
            : Math.round(metrics.cpuUsagePercent);

        return (
          <div key={server.localServerId} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-medium text-foreground-800">
                {server.name}
              </span>
              {metrics.state !== "live" && (
                <StatusIndicator
                  status={metrics.state === "stale" ? "stale" : "notConfigured"}
                />
              )}
            </div>
            {metrics.state === "not_configured" ? (
              <p className="text-[0.7rem] text-muted-foreground">
                {t("serverMetrics.noMetrics")}
              </p>
            ) : (
              <MetricRows>
                <MetricRow
                  label={t("serverMetrics.cpuLabel")}
                  value={cpuPercent === null ? "—" : `${cpuPercent}%`}
                  meter={
                    cpuPercent === null ? undefined : (
                      <UsageMeter value={cpuPercent} />
                    )
                  }
                />
                <MetricRow
                  label={t("serverMetrics.memoryLabel")}
                  value={memory?.text ?? "—"}
                  meter={memory && <UsageMeter value={memory.percent} />}
                />
                <MetricRow
                  label={t("serverMetrics.diskLabel")}
                  value={disk?.text ?? "—"}
                  meter={disk && <UsageMeter value={disk.percent} />}
                />
              </MetricRows>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <p className="text-[0.7rem] text-muted-foreground">
          {t("serverMetrics.moreCount", { count: hidden })}
        </p>
      )}
    </div>
  );
}
