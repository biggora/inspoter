"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardGrid } from "@/components/shell/card-grid";
import { Icon } from "@/components/ui/icon";
import { NotificationToast } from "@/components/shell/notification-toast";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { ProviderCredentialDialog } from "@/components/settings/provider-credential-dialog";
import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityCardHeader } from "@/components/ui/entity-card-header";
import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import { MetricRow, MetricRows } from "@/components/ui/metric-row";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { UsageMeter } from "@/components/ui/usage-meter";
import { usageFromTotals } from "@/lib/format/bytes";
import type { ServerStatus } from "@/lib/providers/servers/types";
import { MetricsAgentDialog } from "./metrics-agent-dialog";
import {
  formatRelativeTime,
  formatUptime,
  metricsState,
  statusState,
} from "./format";
import { ServerPowerActions } from "./server-power-actions";
import {
  useServerPowerAction,
  type PowerActionType,
} from "./use-server-power-action";
import {
  fetchServers,
  refreshServers,
  type ProviderServerDto,
  type ServerDto,
} from "./api";

interface Notification {
  message: string;
  variant: "success" | "error";
}

type PageState = "loading" | "error" | "empty" | "ready";

export function ServersView() {
  const t = useTranslations("servers");
  const [servers, setServers] = useState<ServerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [enrollmentTarget, setEnrollmentTarget] = useState<{
    name: string;
  } | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showNotification = useCallback(
    (message: string, variant: "success" | "error") => {
      setNotification({ message, variant });
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      notificationTimeoutRef.current = setTimeout(
        () => setNotification(null),
        4000,
      );
    },
    [],
  );

  // `force` asks the server for a live provider fan-out instead of the cached
  // inventory — the Refresh and Retry buttons need it, since a plain fetch
  // would just replay the same snapshot.
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const response = force ? await refreshServers() : await fetchServers();
        setServers(response.servers);

        const errors = response.providerErrors.map(
          (e) => `${e.label}: ${e.error}`,
        );
        setLoadError(errors.length ? errors.join("; ") : null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const reload = useCallback(() => load(true), [load]);

  // The initial fetch runs from a locally-defined async function rather than
  // straight from the effect body, so its loading/error resets aren't flagged
  // as synchronous setState in an effect (react-hooks/set-state-in-effect) —
  // the same pattern as services/service-detail-view.tsx.
  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, [load]);

  const clearCardError = useCallback((id: string) => {
    setCardErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const applyStatus = useCallback(
    (localServerId: string, status: ServerStatus) => {
      setServers((prev) =>
        prev.map((s) =>
          s.localServerId === localServerId && s.origin === "provider"
            ? { ...s, status }
            : s,
        ),
      );
    },
    [],
  );

  const applyServer = useCallback((updated: ProviderServerDto) => {
    setServers((prev) =>
      prev.map((s) =>
        s.localServerId === updated.localServerId ? updated : s,
      ),
    );
  }, []);

  const onSettled = useCallback(
    (server: ProviderServerDto) => {
      showNotification(
        t("actionSuccessToast", { name: server.name }),
        "success",
      );
    },
    [showNotification, t],
  );

  const onPowerError = useCallback((localServerId: string, message: string) => {
    setCardErrors((prev) => ({ ...prev, [localServerId]: message }));
  }, []);

  const triggerPowerAction = useServerPowerAction({
    applyStatus,
    applyServer,
    onSettled,
    onError: onPowerError,
  });

  const handlePowerAction = useCallback(
    (server: ProviderServerDto, action: PowerActionType) => {
      clearCardError(server.localServerId);
      void triggerPowerAction(server, action);
    },
    [clearCardError, triggerPowerAction],
  );

  const handleSetupMonitoring = useCallback((server: ServerDto) => {
    setEnrollmentTarget({ name: server.name });
  }, []);

  // Only the first load empties the page into a skeleton. A refresh over
  // inventory we already have keeps the cards and dims them instead
  // (design.md §4.4: retain confirmed data while a mutation/refresh runs).
  const pageState: PageState =
    loading && servers.length === 0
      ? "loading"
      : servers.length === 0 && loadError
        ? "error"
        : servers.length === 0
          ? "empty"
          : "ready";

  return (
    <PageBody>
      {notification && (
        <NotificationToast
          message={notification.message}
          variant={notification.variant}
        />
      )}

      <PageHeader
        title={t("pageTitle")}
        description={
          pageState === "ready"
            ? t("serversCount", { count: servers.length })
            : undefined
        }
        actions={
          <>
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addProviderButton")}
            </Button>
            {pageState !== "loading" ? (
              <RefreshButton onClick={reload} loading={loading} />
            ) : undefined}
          </>
        }
      />

      {pageState === "loading" && (
        <LoadingRegion>
          <CardGridSkeleton metricRows={5} footerActions={2} />
        </LoadingRegion>
      )}

      {pageState === "error" && (
        <EmptyState
          tone="danger"
          icon="ri-cloud-off-line"
          title={t("providerUnavailableTitle")}
          description={loadError ?? t("providerUnavailableDescription")}
          action={
            <RefreshButton
              onClick={reload}
              label={t("retryButton")}
              variant="default"
            />
          }
        />
      )}

      {pageState === "empty" && (
        <EmptyState
          icon="ri-server-line"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addProviderButton")}
            </Button>
          }
        />
      )}

      {pageState === "ready" && (
        <>
          {loadError && (
            <Alert variant="error" className="animate-fade-in">
              <Icon name="ri-alert-line" aria-hidden />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}
          <LoadingOverlay busy={loading}>
            <CardGrid>
              {servers.map((server) => (
                <ServerCard
                  key={server.localServerId}
                  server={server}
                  onPowerAction={handlePowerAction}
                  onSetupMonitoring={handleSetupMonitoring}
                  error={cardErrors[server.localServerId]}
                />
              ))}
            </CardGrid>
          </LoadingOverlay>
        </>
      )}

      {isCreateProviderOpen && (
        <ProviderCredentialDialog
          open={isCreateProviderOpen}
          onOpenChange={setIsCreateProviderOpen}
          mode="create"
          existing={null}
          onSaved={reload}
        />
      )}

      {enrollmentTarget && (
        <MetricsAgentDialog
          open={enrollmentTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEnrollmentTarget(null);
          }}
          serverName={enrollmentTarget.name}
        />
      )}
    </PageBody>
  );
}

function ServerCard({
  server,
  onPowerAction,
  onSetupMonitoring,
  error,
}: {
  server: ServerDto;
  onPowerAction: (server: ProviderServerDto, action: PowerActionType) => void;
  onSetupMonitoring: (server: ServerDto) => void;
  error?: string;
}) {
  const t = useTranslations("servers");
  const cardRef = useRef<HTMLDivElement>(null);

  const isProvider = server.origin === "provider";
  const metrics = server.metrics;
  const metricsStatus = metricsState[metrics.state] ?? "notConfigured";

  const status = isProvider ? (server.status as ServerStatus) : null;
  const cardStatus = status ? (statusState[status] ?? "unknown") : null;

  // One resource section per card: the agent's live utilisation and the
  // provider's capacity are the same three facts, so they share three rows.
  // Where the agent reports a real total (memory, mounted filesystem) it wins
  // over the plan's nominal figure — that is the number the operator acts on.
  const cpuPercent = metrics.cpuUsagePercent;
  const memory = usageFromTotals(
    metrics.memoryTotalBytes,
    metrics.memoryAvailableBytes,
  );
  const disk = usageFromTotals(
    metrics.filesystemTotalBytes,
    metrics.filesystemAvailableBytes,
  );

  const cpuCapacity = isProvider ? server.cpu : null;
  const cpuValue =
    cpuPercent !== null
      ? [`${cpuPercent.toFixed(1)}%`, cpuCapacity].filter(Boolean).join(" · ")
      : cpuCapacity;
  const memoryValue = memory?.text ?? (isProvider ? server.ram : null);
  const diskValue = disk?.text ?? (isProvider ? server.disk : null);

  return (
    <Card
      ref={cardRef}
      role="group"
      aria-label={t("serverCardLabel", { name: server.name })}
      tabIndex={-1}
      size="sm"
    >
      {/* The name is the way into the server's history — only the title is a
          link, so the power buttons below stay their own targets. */}
      <EntityCardHeader
        icon="ri-server-line"
        title={
          <Link
            href={`/servers/${server.localServerId}`}
            className="block py-1.5 text-inherit no-underline hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
          >
            {server.name}
          </Link>
        }
        // The identity line is always a machine identifier — IP for provider
        // servers, hostname for agent-managed ones — so it rides JetBrains
        // Mono (DESIGN.md §2.3).
        description={isProvider ? server.ip : (server.hostname ?? "")}
        descriptionClassName="font-mono"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {cardStatus && <StatusIndicator status={cardStatus} />}
            <StatusIndicator status={metricsStatus} />
            {!isProvider && (
              <Badge variant="secondary">{t("agentOnlyBadge")}</Badge>
            )}
            {isProvider && server.providerAvailability === "unavailable" && (
              <Badge variant="secondary">{t("providerUnavailableBadge")}</Badge>
            )}
            {isProvider && server.providerAvailability === "missing" && (
              <Badge variant="secondary">{t("providerMissingBadge")}</Badge>
            )}
          </div>
        }
      />

      <CardContent className="flex flex-col gap-1.5">
        {!isProvider && (
          <p className="text-xs text-foreground-400">{t("agentOnlyNotice")}</p>
        )}

        <MetricRows>
          {!isProvider && server.hostname && (
            <MetricRow label={t("hostnameLabel")} value={server.hostname} />
          )}

          {cpuValue && (
            <MetricRow
              label={t("cpuUsageLabel")}
              value={cpuValue}
              meter={
                cpuPercent === null ? undefined : (
                  <UsageMeter value={cpuPercent} />
                )
              }
            />
          )}
          {memoryValue && (
            <MetricRow
              label={t("memoryLabel")}
              value={memoryValue}
              meter={memory && <UsageMeter value={memory.percent} />}
            />
          )}
          {diskValue && (
            <MetricRow
              label={t("diskLabel")}
              value={diskValue}
              meter={disk && <UsageMeter value={disk.percent} />}
            />
          )}

          {isProvider && (
            <>
              <MetricRow label={t("osLabel")} value={server.os} />
              <MetricRow label={t("locationLabel")} value={server.location} />
            </>
          )}

          {metrics.load1 !== null && (
            <MetricRow
              label={t("loadLabel")}
              value={`${metrics.load1.toFixed(2)} / ${metrics.load5?.toFixed(2)} / ${metrics.load15?.toFixed(2)}`}
            />
          )}
          {metrics.uptimeSeconds && (
            <MetricRow
              label={t("uptimeLabel")}
              value={formatUptime(BigInt(metrics.uptimeSeconds))}
            />
          )}
        </MetricRows>

        {metrics.state === "not_configured" && (
          <p className="text-xs text-foreground-400">
            {t("monitoringNotConnected")}
          </p>
        )}
        {metrics.receivedAt && (
          <p className="text-2xs text-foreground-400 text-right">
            {t("lastUpdate", { time: formatRelativeTime(metrics.receivedAt) })}
          </p>
        )}

        {error && (
          <Alert variant="error" className="mt-1 animate-fade-in">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {((isProvider && server.powerActionsAvailable) ||
        metrics.state === "not_configured") && (
        <CardFooter className="flex-wrap gap-2">
          {isProvider && server.powerActionsAvailable && (
            <ServerPowerActions
              server={server}
              onAction={onPowerAction}
              confirmedFocus={() => cardRef.current}
            />
          )}
          {metrics.state === "not_configured" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetupMonitoring(server)}
            >
              <Icon
                name="ri-shield-check-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("setupMonitoring")}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
