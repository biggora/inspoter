"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CirclePlay,
  CircleStop,
  CloudOff,
  RefreshCw,
  RotateCcw,
  ServerIcon,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
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
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
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
      setLoadError(
        err instanceof Error ? err.message : "Не удалось загрузить серверы",
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
          [server.id]:
            err instanceof Error
              ? err.message
              : "Не удалось выполнить действие",
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
              `${server.name}: действие выполнено успешно`,
              "success",
            );
          }
        } catch (err) {
          clearInterval(interval);
          pollingRef.current.delete(server.id);
          setCardErrors((prev) => ({
            ...prev,
            [server.id]:
              err instanceof Error ? err.message : "Не удалось обновить статус",
          }));
        }
      }, 2000);
      pollingRef.current.set(server.id, interval);
    },
    [clearCardError, showNotification],
  );

  const pageState: PageState = loading
    ? "loading"
    : servers.length === 0 && loadError
      ? "error"
      : servers.length === 0
        ? "empty"
        : "ready";

  if (pageState === "loading") {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <EmptyState
          bordered={false}
          tone="danger"
          icon={CloudOff}
          title="Hetzner недоступен"
          description="Не удалось получить данные о серверах. Проверьте подключение или попробуйте позже."
          className="max-w-sm animate-scale-in"
          action={
            <Button onClick={load}>
              <RefreshCw aria-hidden data-icon="inline-start" />
              Повторить
            </Button>
          }
        />
      </div>
    );
  }

  if (pageState === "empty") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <EmptyState
          bordered={false}
          icon={ServerIcon}
          title="Нет серверов"
          description="В вашем аккаунте Hetzner пока нет активных VPS. Создайте сервер через панель Hetzner, и он появится здесь."
          className="max-w-sm animate-scale-in"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === "success"
              ? "bg-accent-100/80 text-accent-800"
              : "bg-primary-100/70 text-primary-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${
              notification.variant === "success"
                ? "ri-check-line"
                : "ri-error-warning-line"
            } w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      <PageHeader
        title="Серверы"
        description={`${servers.length} ${
          servers.length === 1
            ? "сервер"
            : servers.length >= 2 && servers.length <= 4
              ? "сервера"
              : "серверов"
        }`}
        actions={
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw aria-hidden data-icon="inline-start" />
            Обновить
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            onPowerAction={handlePowerAction}
            error={cardErrors[server.id]}
          />
        ))}
      </div>
    </div>
  );
}

const statusConfig: Record<
  ServerStatus,
  {
    label: string;
    variant: "success" | "secondary" | "warning";
  }
> = {
  running: {
    label: "Работает",
    variant: "success",
  },
  stopped: {
    label: "Остановлен",
    variant: "secondary",
  },
  starting: {
    label: "Запуск…",
    variant: "warning",
  },
  stopping: {
    label: "Остановка…",
    variant: "warning",
  },
  restarting: {
    label: "Перезапуск…",
    variant: "warning",
  },
  unknown: {
    label: "Неизвестно",
    variant: "secondary",
  },
};

interface PowerCardAction {
  action: PowerActionType;
  label: string;
  icon: LucideIcon;
  confirmTitle: string;
  confirmText: string;
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

const PENDING_ACTION_LABELS: Record<PowerActionType, string> = {
  start: "Запускается…",
  stop: "Останавливается…",
  restart: "Перезапускается…",
};

function getPowerAction(
  server: Server,
  action: PowerActionType,
): PowerCardAction {
  switch (action) {
    case "start":
      return {
        action,
        label: "Запустить",
        icon: CirclePlay,
        confirmTitle: `Запустить «${server.name}»?`,
        confirmText: "Сервер будет запущен. Это может занять несколько секунд.",
      };
    case "stop":
      return {
        action,
        label: "Остановить",
        icon: CircleStop,
        confirmTitle: `Остановить «${server.name}»?`,
        confirmText: "Сервер будет остановлен и станет недоступен.",
      };
    case "restart":
      return {
        action,
        label: "Перезапустить",
        icon: RotateCcw,
        confirmTitle: `Перезапустить «${server.name}»?`,
        confirmText: "Сервер перезапустится и будет ненадолго недоступен.",
      };
  }
}

function getAvailableActions(server: Server): PowerCardAction[] {
  const actions = POWER_ACTIONS_BY_STATUS[server.status] ?? [];
  return actions.map((action) => getPowerAction(server, action));
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
      aria-label={`Сервер «${server.name}»`}
      tabIndex={-1}
      size="sm"
    >
      <CardHeader className="border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100">
            <ServerIcon aria-hidden className="size-4 text-secondary-600" />
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
            {config.label}
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
          <span className="text-foreground-500">Диск</span>
          <span className="text-foreground-800 font-medium">{server.disk}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">ОС</span>
          <span className="text-foreground-800 font-medium">{server.os}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Расположение</span>
          <span className="text-foreground-800 font-medium">
            {server.location}
          </span>
        </div>
        {error && (
          <Alert variant="error" className="mt-1 animate-fade-in">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        {availableActions.map((act) => {
          const ActionIcon = act.icon;
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
                  <ActionIcon aria-hidden data-icon="inline-start" />
                )}
                {actionBusy ? PENDING_ACTION_LABELS[act.action] : act.label}
              </AlertDialogTrigger>
              <AlertDialogContent
                finalFocus={() =>
                  confirmingRef.current
                    ? cardRef.current
                    : activeTriggerRef.current
                }
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>{act.confirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {act.confirmText}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    variant={act.action === "stop" ? "destructive" : "default"}
                    onClick={() => handleConfirm(act.action)}
                  >
                    Подтвердить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })}
        {availableActions.length === 0 && !busy && (
          <span className="text-xs text-foreground-400">
            Нет доступных действий
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
