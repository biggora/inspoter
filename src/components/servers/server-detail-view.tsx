"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { LoadingRegion } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  TimeSeriesChart,
  type ChartSeries,
  type SeriesStats,
} from "@/components/ui/time-series-chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UsageMeter } from "@/components/ui/usage-meter";
import { usageFromTotals } from "@/lib/format/bytes";
import type { ServerStatus } from "@/lib/providers/servers/types";
import {
  getServerByLocalId,
  getServerMetricsHistory,
  ServerNotFoundError,
  type HistoryRangeKey,
  type MetricsHistoryDto,
  type ProviderServerDto,
  type ServerDto,
} from "./api";
import {
  formatRelativeTime,
  formatUptime,
  metricsState,
  statusState,
} from "./format";
import { MetricsAgentDialog } from "./metrics-agent-dialog";
import { ServerPowerActions } from "./server-power-actions";
import {
  useServerPowerAction,
  type PowerActionType,
} from "./use-server-power-action";

// One server's page: everything its card states, plus the history the card
// cannot show. The agent pushes a sample a minute and the app keeps 30 days of
// them, so "what did this machine do overnight" is answered here rather than
// from a single current reading.
//
// Data is fetched client-side with the active-workspace header, exactly as the
// grid does (servers-view.tsx): the workspace a tab is looking at lives in
// that tab, and a server-rendered page would answer from the session's
// workspace instead.

const RANGES: HistoryRangeKey[] = ["24h", "48h", "5d", "7d", "30d"];
const RANGE_LABEL_KEYS: Record<HistoryRangeKey, string> = {
  "24h": "range24h",
  "48h": "range48h",
  "5d": "range5d",
  "7d": "range7d",
  "30d": "range30d",
};

const DEFAULT_RANGE: HistoryRangeKey = "24h";
const POLL_INTERVAL_MS = 60_000;

function isRange(value: string | null): value is HistoryRangeKey {
  return value !== null && (RANGES as string[]).includes(value);
}

export function ServerDetailView({
  localServerId,
  initialRange,
}: {
  localServerId: string;
  initialRange?: string;
}) {
  const t = useTranslations("servers");
  const format = useFormatter();

  const [server, setServer] = useState<ServerDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);

  const [range, setRange] = useState<HistoryRangeKey>(
    isRange(initialRange ?? null)
      ? (initialRange as HistoryRangeKey)
      : DEFAULT_RANGE,
  );
  const [history, setHistory] = useState<MetricsHistoryDto | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadServer = useCallback(async () => {
    try {
      const dto = await getServerByLocalId(localServerId);
      setServer(dto);
      setNotFound(false);
      setLoadError(null);
    } catch (err) {
      // A missing server is its own state: it was removed, or it belongs to
      // another workspace. Anything else is a transient failure worth retrying.
      setNotFound(err instanceof ServerNotFoundError);
      setLoadError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [localServerId, t]);

  const loadHistory = useCallback(
    async (next: HistoryRangeKey) => {
      setHistoryLoading(true);
      try {
        const data = await getServerMetricsHistory(localServerId, next);
        setHistory(data);
        setHistoryError(null);
      } catch {
        setHistoryError(t("historyLoadError"));
      } finally {
        setHistoryLoading(false);
      }
    },
    [localServerId, t],
  );

  useEffect(() => {
    async function run() {
      await loadServer();
    }
    void run();
  }, [loadServer]);

  useEffect(() => {
    async function run() {
      await loadHistory(range);
    }
    void run();
  }, [loadHistory, range]);

  // The agent pushes once a minute, so refreshing faster would only re-render
  // the same numbers. Paused while the tab is hidden, like the services page.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      void loadServer();
      void loadHistory(range);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadHistory, loadServer, range]);

  const applyStatus = useCallback(
    (_localServerId: string, status: ServerStatus) => {
      setServer((prev) =>
        prev && prev.origin === "provider" ? { ...prev, status } : prev,
      );
    },
    [],
  );

  const applyServer = useCallback((updated: ProviderServerDto) => {
    setServer(updated);
  }, []);

  const onSettled = useCallback(() => setActionError(null), []);

  const onPowerError = useCallback(
    (_localServerId: string, message: string) => setActionError(message),
    [],
  );

  const triggerPowerAction = useServerPowerAction({
    applyStatus,
    applyServer,
    onSettled,
    onError: onPowerError,
  });

  const handlePowerAction = useCallback(
    (target: ProviderServerDto, action: PowerActionType) => {
      setActionError(null);
      void triggerPowerAction(target, action);
    },
    [triggerPowerAction],
  );

  const formatTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "—";
      // Ranges of a day or two are read by clock time; deeper ones need the
      // date to tell one afternoon from another.
      return range === "24h" || range === "48h"
        ? format.dateTime(date, { hour: "2-digit", minute: "2-digit" })
        : format.dateTime(date, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
    },
    [format, range],
  );

  // The axis ends always carry the date: a 24-hour window opens and closes at
  // the same clock time, and "05:20 … 05:20" says nothing.
  const formatAxisTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "—";
      return format.dateTime(date, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [format],
  );

  const formatSummary = useCallback(
    (
      series: ChartSeries,
      stats: SeriesStats,
      unit: (value: number) => string,
    ) =>
      t("chartSummary", {
        min: unit(stats.min),
        avg: unit(stats.avg),
        max: unit(stats.max),
        now: stats.last === null ? "—" : unit(stats.last),
      }),
    [t],
  );

  const timestamps = useMemo(
    () => history?.points.map((point) => point.t) ?? [],
    [history],
  );

  // The chosen range belongs in the URL so a link to "this server, last five
  // days" can be shared. Written straight to history rather than through the
  // router: this page is force-dynamic, and a router navigation would re-run
  // the server render just to change a query string the client already owns.
  const selectRange = useCallback((next: HistoryRangeKey) => {
    setRange(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("range", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  if (loading) {
    return (
      <PageBody>
        <LoadingRegion>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </LoadingRegion>
      </PageBody>
    );
  }

  if (!server) {
    return (
      <PageBody>
        <PageHeader back={{ href: "/servers", label: t("backToServers") }} />
        <EmptyState
          tone="danger"
          icon={notFound ? "ri-server-line" : "ri-cloud-off-line"}
          title={notFound ? t("notFoundTitle") : t("providerUnavailableTitle")}
          description={
            notFound ? t("notFoundDescription") : (loadError ?? undefined)
          }
          action={
            <Button onClick={() => void loadServer()}>
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("retryButton")}
            </Button>
          }
        />
      </PageBody>
    );
  }

  const isProvider = server.origin === "provider";
  const metrics = server.metrics;
  const status = isProvider ? (server.status as ServerStatus) : null;
  const memory = usageFromTotals(
    metrics.memoryTotalBytes,
    metrics.memoryAvailableBytes,
  );
  const disk = usageFromTotals(
    metrics.filesystemTotalBytes,
    metrics.filesystemAvailableBytes,
  );

  const percentValue = (value: number) => `${Math.round(value)}%`;
  const loadValue = (value: number) => value.toFixed(2);

  const points = history?.points ?? [];
  const hasHistory = points.length > 0;

  const cpuSeries: ChartSeries[] = [
    {
      key: "cpuAvg",
      label: t("cpuAverageSeries"),
      values: points.map((point) => point.cpuAvg),
      tone: "primary",
      area: true,
    },
    {
      key: "cpuMax",
      label: t("cpuPeakSeries"),
      values: points.map((point) => point.cpuMax),
      tone: "secondary",
    },
  ];

  const loadSeries: ChartSeries[] = [
    {
      key: "load1",
      label: t("load1Series"),
      values: points.map((point) => point.load1),
      tone: "primary",
    },
    {
      key: "load5",
      label: t("load5Series"),
      values: points.map((point) => point.load5),
      tone: "accent",
    },
    {
      key: "load15",
      label: t("load15Series"),
      values: points.map((point) => point.load15),
      tone: "secondary",
    },
  ];

  const memorySeries: ChartSeries[] = [
    {
      key: "memory",
      label: t("memoryLabel"),
      values: points.map((point) => point.memoryPercent),
      tone: "primary",
      area: true,
    },
    {
      key: "swap",
      label: t("swapLabel"),
      values: points.map((point) => point.swapPercent),
      tone: "accent",
    },
  ];

  const diskSeries: ChartSeries[] = [
    {
      key: "disk",
      label: t("diskLabel"),
      values: points.map((point) => point.diskPercent),
      tone: "primary",
      area: true,
    },
  ];

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/servers", label: t("backToServers") }}
        title={server.name}
        description={isProvider ? server.ip : (server.hostname ?? undefined)}
        actions={
          <>
            {status && (
              <StatusIndicator status={statusState[status] ?? "unknown"} />
            )}
            <StatusIndicator
              status={metricsState[metrics.state] ?? "notConfigured"}
            />
            {!isProvider && (
              <Badge variant="secondary">{t("agentOnlyBadge")}</Badge>
            )}
            {isProvider && server.providerAvailability === "unavailable" && (
              <Badge variant="secondary">{t("providerUnavailableBadge")}</Badge>
            )}
            {isProvider && server.providerAvailability === "missing" && (
              <Badge variant="secondary">{t("providerMissingBadge")}</Badge>
            )}
            {isProvider && server.powerActionsAvailable && (
              <ServerPowerActions
                server={server}
                onAction={handlePowerAction}
              />
            )}
            {metrics.state === "not_configured" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnrollmentOpen(true)}
              >
                <Icon
                  name="ri-shield-check-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("setupMonitoring")}
              </Button>
            )}
          </>
        }
      />

      <div className="rounded-xl border border-background-200 bg-background-50 p-5 flex flex-col gap-4">
        {/* The header already states the address (IP for a provider server,
            hostname for an agent-only one), so the grid doesn't repeat it. */}
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {isProvider && (
            <>
              <SummaryItem label={t("typeLabel")} value={server.type} />
              <SummaryItem label={t("osLabel")} value={server.os} />
              <SummaryItem label={t("locationLabel")} value={server.location} />
            </>
          )}
          <SummaryItem
            label={t("cpuUsageLabel")}
            value={
              metrics.cpuUsagePercent !== null
                ? [
                    `${metrics.cpuUsagePercent.toFixed(1)}%`,
                    isProvider ? server.cpu : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : isProvider
                  ? server.cpu
                  : "—"
            }
            meter={
              metrics.cpuUsagePercent === null ? undefined : (
                <UsageMeter value={metrics.cpuUsagePercent} />
              )
            }
          />
          <SummaryItem
            label={t("memoryLabel")}
            value={memory?.text ?? (isProvider ? server.ram : "—")}
            meter={memory ? <UsageMeter value={memory.percent} /> : undefined}
          />
          <SummaryItem
            label={t("diskLabel")}
            value={disk?.text ?? (isProvider ? server.disk : "—")}
            meter={disk ? <UsageMeter value={disk.percent} /> : undefined}
          />
          {metrics.load1 !== null && (
            <SummaryItem
              label={t("loadLabel")}
              value={`${metrics.load1.toFixed(2)} / ${metrics.load5?.toFixed(2)} / ${metrics.load15?.toFixed(2)}`}
            />
          )}
          {metrics.uptimeSeconds && (
            <SummaryItem
              label={t("uptimeLabel")}
              value={formatUptime(BigInt(metrics.uptimeSeconds))}
            />
          )}
          {metrics.receivedAt && (
            <SummaryItem
              label={t("lastUpdateLabel")}
              value={formatRelativeTime(metrics.receivedAt)}
            />
          )}
        </dl>

        {metrics.state === "not_configured" && (
          <p className="text-xs text-foreground-400">
            {t("monitoringNotConnected")}
          </p>
        )}

        {actionError && (
          <Alert variant="error" className="animate-fade-in">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-xl border border-background-200 bg-background-50 p-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-sm font-semibold text-foreground-900">
            {t("historyTitle")}
          </h2>
          <ToggleGroup
            value={[range]}
            onValueChange={(values) => {
              const next = values[0];
              if (isRange(next ?? null)) selectRange(next as HistoryRangeKey);
            }}
            aria-label={t("rangeGroupLabel")}
            spacing={0}
            loopFocus
          >
            {RANGES.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                variant="outline"
                size="sm"
              >
                {t(RANGE_LABEL_KEYS[key])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {historyError && (
          <Alert variant="error">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}

        {historyLoading && !hasHistory ? (
          <LoadingRegion>
            <Skeleton className="h-56 w-full" />
          </LoadingRegion>
        ) : hasHistory ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartPanel title={t("cpuChartTitle")}>
              <TimeSeriesChart
                timestamps={timestamps}
                series={cpuSeries}
                yMax={100}
                formatValue={percentValue}
                formatTime={formatTime}
                formatAxisTime={formatAxisTime}
                markers={history?.reboots}
                markerLabel={t("rebootMarkerLabel")}
                formatSummary={(series, stats) =>
                  formatSummary(series, stats, percentValue)
                }
                ariaLabel={t("cpuChartAria", { name: server.name })}
              />
            </ChartPanel>

            <ChartPanel title={t("loadChartTitle")}>
              <TimeSeriesChart
                timestamps={timestamps}
                series={loadSeries}
                formatValue={loadValue}
                formatTime={formatTime}
                formatAxisTime={formatAxisTime}
                formatSummary={(series, stats) =>
                  formatSummary(series, stats, loadValue)
                }
                ariaLabel={t("loadChartAria", { name: server.name })}
              />
            </ChartPanel>

            <ChartPanel title={t("memoryChartTitle")}>
              <TimeSeriesChart
                timestamps={timestamps}
                series={memorySeries}
                yMax={100}
                formatValue={percentValue}
                formatTime={formatTime}
                formatAxisTime={formatAxisTime}
                formatSummary={(series, stats) =>
                  formatSummary(series, stats, percentValue)
                }
                ariaLabel={t("memoryChartAria", { name: server.name })}
              />
            </ChartPanel>

            <ChartPanel title={t("diskChartTitle")}>
              <TimeSeriesChart
                timestamps={timestamps}
                series={diskSeries}
                yMax={100}
                formatValue={percentValue}
                formatTime={formatTime}
                formatAxisTime={formatAxisTime}
                formatSummary={(series, stats) =>
                  formatSummary(series, stats, percentValue)
                }
                ariaLabel={t("diskChartAria", { name: server.name })}
              />
            </ChartPanel>
          </div>
        ) : (
          <EmptyState
            size="sm"
            icon="ri-line-chart-line"
            title={t("noHistoryTitle")}
            description={
              metrics.state === "not_configured"
                ? t("noHistoryNoAgentDescription")
                : t("noHistoryDescription")
            }
          />
        )}
      </div>

      {enrollmentOpen && (
        <MetricsAgentDialog
          open={enrollmentOpen}
          onOpenChange={setEnrollmentOpen}
          serverName={server.name}
        />
      )}
    </PageBody>
  );
}

function SummaryItem({
  label,
  value,
  meter,
}: {
  label: string;
  value: string;
  meter?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-foreground-500">{label}</dt>
      <dd className="truncate font-medium text-foreground-800">
        {value || "—"}
      </dd>
      {meter && <div className="mt-1">{meter}</div>}
    </div>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-foreground-600">{title}</h3>
      {children}
    </section>
  );
}
