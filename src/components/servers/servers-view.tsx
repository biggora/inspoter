"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardGrid } from "@/components/shell/card-grid";
import { Icon } from "@/components/ui/icon";
import { NotificationToast } from "@/components/shell/notification-toast";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { ProviderCredentialDialog } from "@/components/settings/provider-credential-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import { MetricRow, MetricRows } from "@/components/ui/metric-row";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import {
  StatusIndicator,
  type StatusState,
} from "@/components/ui/status-indicator";
import { UsageMeter } from "@/components/ui/usage-meter";
import { usageFromTotals } from "@/lib/format/bytes";
import type { ServerStatus } from "@/lib/providers/servers/types";
import { MetricsAgentDialog } from "./metrics-agent-dialog";
import {
  fetchServers,
  refreshServers,
  getServer,
  powerAction,
  type MetricsState,
  type ProviderServerDto,
  type ServerDto,
} from "./api";

type PowerActionType = "start" | "stop" | "restart";

interface Notification {
  message: string;
  variant: "success" | "error";
}

type PageState = "loading" | "error" | "empty" | "ready";

const TRANSITIONAL_STATUSES: ServerStatus[] = [
  "starting",
  "stopping",
  "restarting",
];

function formatUptime(seconds: bigint): string {
  const totalMinutes = Number(seconds) / 60;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = Math.floor(totalMinutes % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

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
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
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

  useEffect(() => {
    load();
    const pollers = pollingRef.current;
    return () => {
      pollers.forEach((interval) => clearInterval(interval));
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

  const handlePowerAction = useCallback(
    async (server: ProviderServerDto, action: PowerActionType) => {
      clearCardError(server.localServerId);
      const previousStatus = server.status as ServerStatus;
      const transitionalStatus: ServerStatus =
        action === "start"
          ? "starting"
          : action === "stop"
            ? "stopping"
            : "restarting";

      setServers((prev) =>
        prev.map((s) =>
          s.localServerId === server.localServerId && s.origin === "provider"
            ? { ...s, status: transitionalStatus }
            : s,
        ),
      );

      try {
        await powerAction(server.providerId, server.remoteServerId, action);
      } catch (err) {
        setServers((prev) =>
          prev.map((s) =>
            s.localServerId === server.localServerId && s.origin === "provider"
              ? { ...s, status: previousStatus }
              : s,
          ),
        );
        setCardErrors((prev) => ({
          ...prev,
          [server.localServerId]:
            err instanceof Error ? err.message : t("actionError"),
        }));
        return;
      }

      const existing = pollingRef.current.get(server.localServerId);
      if (existing) clearInterval(existing);

      const interval = setInterval(async () => {
        try {
          const updated = await getServer(
            server.providerId,
            server.remoteServerId,
          );
          setServers((prev) =>
            prev.map((s) =>
              s.localServerId === server.localServerId ? updated : s,
            ),
          );
          if (!TRANSITIONAL_STATUSES.includes(updated.status as ServerStatus)) {
            clearInterval(interval);
            pollingRef.current.delete(server.localServerId);
            showNotification(
              t("actionSuccessToast", { name: server.name }),
              "success",
            );
          }
        } catch (err) {
          clearInterval(interval);
          pollingRef.current.delete(server.localServerId);
          setCardErrors((prev) => ({
            ...prev,
            [server.localServerId]:
              err instanceof Error ? err.message : t("statusUpdateError"),
          }));
        }
      }, 2000);
      pollingRef.current.set(server.localServerId, interval);
    },
    [clearCardError, showNotification, t],
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
              <Button variant="outline" onClick={reload} disabled={loading}>
                <Icon
                  name="ri-refresh-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("refreshButton")}
              </Button>
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
            <Button onClick={reload}>
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("retryButton")}
            </Button>
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

// Provider power states mapped onto the app-wide status vocabulary — the
// indicator supplies colour, wording, and pulse (ui/status-indicator.tsx).
const statusState: Record<ServerStatus, StatusState> = {
  running: "up",
  stopped: "stopped",
  starting: "starting",
  stopping: "stopping",
  restarting: "restarting",
  unknown: "unknown",
};

const metricsState: Record<MetricsState, StatusState> = {
  live: "up",
  stale: "stale",
  not_configured: "notConfigured",
};

interface PowerCardAction {
  action: PowerActionType;
  icon: string;
  labelKey: string;
  confirmTitleKey: string;
  confirmTextKey: string;
}

const PENDING_ACTION_BY_STATUS: Partial<Record<ServerStatus, PowerActionType>> =
  {
    starting: "start",
    stopping: "stop",
    restarting: "restart",
  };

const POWER_ACTIONS_BY_STATUS = {
  running: ["restart", "stop"],
  stopped: ["start"],
  starting: ["start"],
  stopping: ["stop"],
  restarting: ["restart"],
  unknown: ["start"],
} as const satisfies Record<ServerStatus, readonly PowerActionType[]>;

const PENDING_ACTION_LABEL_KEYS: Record<PowerActionType, string> = {
  start: "pendingStart",
  stop: "pendingStop",
  restart: "pendingRestart",
};

const POWER_ACTION_CONFIG: Record<
  PowerActionType,
  Omit<PowerCardAction, "action">
> = {
  start: {
    icon: "ri-play-circle-line",
    labelKey: "startAction",
    confirmTitleKey: "startConfirmTitle",
    confirmTextKey: "startConfirmText",
  },
  stop: {
    icon: "ri-stop-circle-line",
    labelKey: "stopAction",
    confirmTitleKey: "stopConfirmTitle",
    confirmTextKey: "stopConfirmText",
  },
  restart: {
    icon: "ri-restart-line",
    labelKey: "restartAction",
    confirmTitleKey: "restartConfirmTitle",
    confirmTextKey: "restartConfirmText",
  },
};

function getAvailableActions(server: ProviderServerDto): PowerCardAction[] {
  const status = server.status as ServerStatus;
  const actions = POWER_ACTIONS_BY_STATUS[status] ?? [];
  return actions.map((action) => ({
    action,
    ...POWER_ACTION_CONFIG[action],
  }));
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
  const [pendingAction, setPendingAction] = useState<PowerActionType | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);

  const isProvider = server.origin === "provider";
  const metrics = server.metrics;
  const metricsStatus = metricsState[metrics.state] ?? "notConfigured";

  const status = isProvider ? (server.status as ServerStatus) : null;
  const cardStatus = status ? (statusState[status] ?? "unknown") : null;
  const busy = status ? TRANSITIONAL_STATUSES.includes(status) : false;
  const busyAction = status ? PENDING_ACTION_BY_STATUS[status] : undefined;
  const availableActions = isProvider ? getAvailableActions(server) : [];

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

  useEffect(() => {
    if (pendingAction === null && confirmingRef.current) {
      confirmingRef.current = false;
      cardRef.current?.focus();
    }
  }, [pendingAction]);

  const handleConfirm = (action: PowerActionType) => {
    if (confirmingRef.current || !isProvider) return;
    confirmingRef.current = true;
    setPendingAction(null);
    onPowerAction(server, action);
  };

  return (
    <Card
      ref={cardRef}
      role="group"
      aria-label={t("serverCardLabel", { name: server.name })}
      tabIndex={-1}
      size="sm"
    >
      <CardHeader className="border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100">
            <Icon
              name="ri-server-line"
              aria-hidden
              className="text-base text-secondary-600"
            />
          </div>
          <div className="min-w-0">
            <CardTitle>
              <h4 className="truncate">{server.name}</h4>
            </CardTitle>
            <CardDescription className="text-xs">
              {isProvider ? server.ip : (server.hostname ?? "")}
            </CardDescription>
          </div>
        </div>
        <CardAction>
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
        </CardAction>
      </CardHeader>

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
          <p className="text-[10px] text-foreground-400 text-right">
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
          {isProvider &&
            server.powerActionsAvailable &&
            availableActions.map((act) => {
              const actionBusy = busy && busyAction === act.action;

              return (
                <AlertDialog
                  key={act.action}
                  open={pendingAction === act.action}
                  onOpenChange={(open) => {
                    if (open) {
                      confirmingRef.current = false;
                      setPendingAction(act.action);
                    } else if (pendingAction === act.action) {
                      setPendingAction(null);
                    }
                  }}
                >
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionBusy}
                        onFocus={(event) => {
                          activeTriggerRef.current = event.currentTarget;
                        }}
                      />
                    }
                  >
                    {actionBusy ? (
                      <Spinner aria-hidden data-icon="inline-start" />
                    ) : (
                      <Icon
                        name={act.icon}
                        aria-hidden
                        data-icon="inline-start"
                      />
                    )}
                    {actionBusy
                      ? t(PENDING_ACTION_LABEL_KEYS[act.action])
                      : t(act.labelKey)}
                  </AlertDialogTrigger>
                  <AlertDialogContent
                    finalFocus={() =>
                      confirmingRef.current
                        ? cardRef.current
                        : activeTriggerRef.current
                    }
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t(act.confirmTitleKey, { name: server.name })}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(act.confirmTextKey)}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant={
                          act.action === "stop" ? "destructive" : "default"
                        }
                        onClick={() => handleConfirm(act.action)}
                      >
                        {t("confirmButton")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            })}
          {isProvider &&
            server.powerActionsAvailable &&
            availableActions.length === 0 &&
            !busy && (
              <span className="text-xs text-foreground-400">
                {t("noActionsAvailable")}
              </span>
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
