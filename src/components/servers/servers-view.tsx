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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ServerStatus } from "@/lib/providers/servers/types";
import {
  fetchServers,
  getServer,
  powerAction,
  type ServerDto,
  type ServersByProviderDto,
} from "./api";

type Server = Omit<ServerDto, "status"> & {
  providerId: string;
  status: ServerStatus;
};

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

export function ServersView() {
  const t = useTranslations("servers");
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
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
      const groups: ServersByProviderDto[] = await fetchServers();
      const flat: Server[] = [];
      const errors: string[] = [];
      for (const g of groups) {
        if (g.error) errors.push(`${g.label}: ${g.error}`);
        for (const s of g.servers)
          flat.push({
            ...s,
            status: s.status as ServerStatus,
            providerId: g.providerId,
          });
      }
      setServers(flat);
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
    async (server: Server, action: PowerActionType) => {
      clearCardError(server.id);
      const previousStatus = server.status;
      const transitionalStatus: ServerStatus =
        action === "start"
          ? "starting"
          : action === "stop"
            ? "stopping"
            : "restarting";

      setServers((prev) =>
        prev.map((s) =>
          s.id === server.id ? { ...s, status: transitionalStatus } : s,
        ),
      );

      try {
        await powerAction(server.providerId, server.id, action);
      } catch (err) {
        setServers((prev) =>
          prev.map((s) =>
            s.id === server.id ? { ...s, status: previousStatus } : s,
          ),
        );
        setCardErrors((prev) => ({
          ...prev,
          [server.id]: err instanceof Error ? err.message : t("actionError"),
        }));
        return;
      }

      const existing = pollingRef.current.get(server.id);
      if (existing) clearInterval(existing);

      const interval = setInterval(async () => {
        try {
          const raw = await getServer(server.providerId, server.id);
          const updated = { ...raw, providerId: server.providerId } as Server;
          setServers((prev) =>
            prev.map((s) => (s.id === server.id ? updated : s)),
          );
          if (!TRANSITIONAL_STATUSES.includes(updated.status)) {
            clearInterval(interval);
            pollingRef.current.delete(server.id);
            showNotification(
              t("actionSuccessToast", { name: server.name }),
              "success",
            );
          }
        } catch (err) {
          clearInterval(interval);
          pollingRef.current.delete(server.id);
          setCardErrors((prev) => ({
            ...prev,
            [server.id]:
              err instanceof Error ? err.message : t("statusUpdateError"),
          }));
        }
      }, 2000);
      pollingRef.current.set(server.id, interval);
    },
    [clearCardError, showNotification, t],
  );

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
          description={t("providerUnavailableDescription")}
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
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addProviderButton")}
            </Button>
          }
        />
      )}

      {pageState === "ready" && (
        <CardGrid>
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onPowerAction={handlePowerAction}
              error={cardErrors[server.id]}
            />
          ))}
        </CardGrid>
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

function getAvailableActions(server: Server): PowerCardAction[] {
  const actions = POWER_ACTIONS_BY_STATUS[server.status] ?? [];
  return actions.map((action) => ({
    action,
    ...POWER_ACTION_CONFIG[action],
  }));
}

function ServerCard({
  server,
  onPowerAction,
  error,
}: {
  server: Server;
  onPowerAction: (server: Server, action: PowerActionType) => void;
  error?: string;
}) {
  const t = useTranslations("servers");
  const [pendingAction, setPendingAction] = useState<PowerActionType | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);

  const config = statusConfig[server.status] ?? statusConfig.unknown;
  const busy = TRANSITIONAL_STATUSES.includes(server.status);
  const busyAction = PENDING_ACTION_BY_STATUS[server.status];
  const availableActions = getAvailableActions(server);

  const handleConfirm = (action: PowerActionType) => {
    if (confirmingRef.current) return;
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
            <CardDescription className="text-xs">{server.ip}</CardDescription>
          </div>
        </div>
        <CardAction>
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
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">CPU</span>
          <span className="text-foreground-800 font-medium">{server.cpu}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">RAM</span>
          <span className="text-foreground-800 font-medium">{server.ram}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("diskLabel")}</span>
          <span className="text-foreground-800 font-medium">{server.disk}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("osLabel")}</span>
          <span className="text-foreground-800 font-medium">{server.os}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("locationLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {server.location}
          </span>
        </div>
        {error && (
          <Alert variant="error" className="mt-1 animate-fade-in">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

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
                  <Icon name={act.icon} aria-hidden data-icon="inline-start" />
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
                    variant={act.action === "stop" ? "destructive" : "default"}
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
    </Card>
  );
}
