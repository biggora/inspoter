"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ServerStatus } from "@/lib/providers/servers/types";
import { MetricsAgentDialog } from "./metrics-agent-dialog";
import {
  fetchServers,
  getServer,
  powerAction,
  type MetricsState,
  type ProviderServerDto,
  type ServerDto,
  type ServerMetricsDto,
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

function formatBytes(bytes: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

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
    localServerId: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchServers();
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
  }, [t]);

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
            s.localServerId === server.localServerId &&
            s.origin === "provider"
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
          if (
            !TRANSITIONAL_STATUSES.includes(updated.status as ServerStatus)
          ) {
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
    setEnrollmentTarget({
      name: server.name,
      localServerId: server.localServerId,
    });
  }, []);

  const pageState: PageState = loading
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
              <Button variant="outline" onClick={load}>
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
        <CardGrid>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} size="sm" className="animate-fade-in">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <CardAction>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex items-center justify-between">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </CardContent>
              <CardFooter className="gap-2">
                <Skeleton className="h-7 w-16 rounded-lg" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      )}

      {pageState === "error" && (
        <EmptyState
          tone="danger"
          icon="ri-cloud-off-line"
          title={t("providerUnavailableTitle")}
          description={loadError ?? t("providerUnavailableDescription")}
          action={
            <Button onClick={load}>
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
            <Button
              render={<Link href="/settings/providers" />}
              nativeButton={false}
            >
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
        </>
      )}

      {isCreateProviderOpen && (
        <ProviderCredentialDialog
          open={isCreateProviderOpen}
          onOpenChange={setIsCreateProviderOpen}
          mode="create"
          existing={null}
          onSaved={load}
        />
      )}

      {enrollmentTarget && (
        <MetricsAgentDialog
          open={enrollmentTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEnrollmentTarget(null);
          }}
          serverName={enrollmentTarget.name}
          localServerId={enrollmentTarget.localServerId}
          onTokenCreated={load}
        />
      )}
    </PageBody>
  );
}

const statusConfig: Record<
  ServerStatus,
  {
    labelKey: string;
    variant: "success" | "secondary" | "warning";
  }
> = {
  running: {
    labelKey: "statusRunning",
    variant: "success",
  },
  stopped: {
    labelKey: "statusStopped",
    variant: "secondary",
  },
  starting: {
    labelKey: "statusStarting",
    variant: "warning",
  },
  stopping: {
    labelKey: "statusStopping",
    variant: "warning",
  },
  restarting: {
    labelKey: "statusRestarting",
    variant: "warning",
  },
  unknown: {
    labelKey: "statusUnknown",
    variant: "secondary",
  },
};

const metricsStateConfig: Record<
  MetricsState,
  {
    labelKey: string;
    variant: "success" | "secondary" | "warning" | "destructive";
  }
> = {
  live: { labelKey: "metricsLive", variant: "success" },
  stale: { labelKey: "metricsStale", variant: "warning" },
  waiting: { labelKey: "metricsWaiting", variant: "warning" },
  revoked: { labelKey: "metricsRevoked", variant: "destructive" },
  not_configured: { labelKey: "metricsNotConfigured", variant: "secondary" },
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

function MetricsSection({ metrics }: { metrics: ServerMetricsDto }) {
  const t = useTranslations("servers");

  return (
    <div className="border-t pt-2 mt-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-foreground-500 font-medium">
          {t("metricsLabel")}
        </span>
        <span className="text-foreground-400 text-[10px]">
          {metrics.receivedAt
            ? t("lastUpdate", { time: formatRelativeTime(metrics.receivedAt) })
            : ""}
        </span>
      </div>

      {metrics.cpuUsagePercent !== null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("cpuUsageLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {metrics.cpuUsagePercent.toFixed(1)}%
          </span>
        </div>
      )}

      {metrics.memoryTotalBytes && metrics.memoryAvailableBytes && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("memoryLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {formatBytes(
              BigInt(metrics.memoryTotalBytes) -
                BigInt(metrics.memoryAvailableBytes),
            )}{" "}
            / {formatBytes(BigInt(metrics.memoryTotalBytes))}
          </span>
        </div>
      )}

      {metrics.filesystemTotalBytes && metrics.filesystemAvailableBytes && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("diskUsageLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {formatBytes(
              BigInt(metrics.filesystemTotalBytes) -
                BigInt(metrics.filesystemAvailableBytes),
            )}{" "}
            / {formatBytes(BigInt(metrics.filesystemTotalBytes))}
          </span>
        </div>
      )}

      {metrics.load1 !== null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("loadLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {metrics.load1.toFixed(2)} / {metrics.load5?.toFixed(2)} /{" "}
            {metrics.load15?.toFixed(2)}
          </span>
        </div>
      )}

      {metrics.uptimeSeconds && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("uptimeLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {formatUptime(BigInt(metrics.uptimeSeconds))}
          </span>
        </div>
      )}
    </div>
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
  const [pendingAction, setPendingAction] = useState<PowerActionType | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);

  const isProvider = server.origin === "provider";
  const metrics = server.metrics;
  const metricsConfig =
    metricsStateConfig[metrics.state] ?? metricsStateConfig.not_configured;

  const status = isProvider ? (server.status as ServerStatus) : null;
  const config = status ? statusConfig[status] ?? statusConfig.unknown : null;
  const busy = status ? TRANSITIONAL_STATUSES.includes(status) : false;
  const busyAction = status ? PENDING_ACTION_BY_STATUS[status] : undefined;
  const availableActions = isProvider ? getAvailableActions(server) : [];

  const showMetricsSection =
    metrics.state === "live" ||
    metrics.state === "stale" ||
    (metrics.state === "revoked" && metrics.cpuUsagePercent !== null);

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
            {config && (
              <Badge variant={config.variant}>
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full bg-current",
                    busy && "animate-pulse motion-reduce:animate-none",
                  )}
                  aria-hidden="true"
                />
                {t(config.labelKey)}
              </Badge>
            )}
            <Badge variant={metricsConfig.variant}>
              {t(metricsConfig.labelKey)}
            </Badge>
            {!isProvider && (
              <Badge variant="secondary">{t("agentOnlyBadge")}</Badge>
            )}
            {isProvider && server.providerAvailability === "unavailable" && (
              <Badge variant="secondary">
                {t("providerUnavailableBadge")}
              </Badge>
            )}
            {isProvider && server.providerAvailability === "missing" && (
              <Badge variant="secondary">{t("providerMissingBadge")}</Badge>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        {isProvider ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">CPU</span>
              <span className="text-foreground-800 font-medium">
                {server.cpu}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">RAM</span>
              <span className="text-foreground-800 font-medium">
                {server.ram}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">{t("diskLabel")}</span>
              <span className="text-foreground-800 font-medium">
                {server.disk}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">{t("osLabel")}</span>
              <span className="text-foreground-800 font-medium">
                {server.os}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">
                {t("locationLabel")}
              </span>
              <span className="text-foreground-800 font-medium">
                {server.location}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-foreground-400">
              {t("agentOnlyNotice")}
            </p>
            {server.hostname && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-500">
                  {t("hostnameLabel")}
                </span>
                <span className="text-foreground-800 font-medium">
                  {server.hostname}
                </span>
              </div>
            )}
          </>
        )}

        {metrics.state === "not_configured" && (
          <p className="text-xs text-foreground-400">
            {t("monitoringNotConnected")}
          </p>
        )}
        {metrics.state === "waiting" && (
          <p className="text-xs text-foreground-400">
            {t("waitingForAgent")}
          </p>
        )}
        {showMetricsSection && <MetricsSection metrics={metrics} />}

        {error && (
          <Alert variant="error" className="mt-1 animate-fade-in">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {isProvider && server.powerActionsAvailable && (
        <CardFooter className="gap-2">
          {availableActions.map((act) => {
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
          {availableActions.length === 0 && !busy && (
            <span className="text-xs text-foreground-400">
              {t("noActionsAvailable")}
            </span>
          )}
        </CardFooter>
      )}

      {(metrics.state === "not_configured" || metrics.state === "revoked") && (
        <CardFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetupMonitoring(server)}
          >
            <Icon name="ri-shield-check-line" aria-hidden data-icon="inline-start" />
            {metrics.state === "not_configured"
              ? t("setupMonitoring")
              : t("reconnectAgent")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
