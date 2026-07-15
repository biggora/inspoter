"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerStatus } from "@/lib/providers/servers/types";
import { fetchServers, getServer, powerAction } from "./api";

interface Server {
  id: string;
  name: string;
  type: string;
  status: ServerStatus;
  ip: string;
  cpu: string;
  ram: string;
  disk: string;
  os: string;
  location: string;
}

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
      const data = await fetchServers();
      setServers(data);
      setLoadError(null);
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
        await powerAction(server.id, action);
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
          const updated = await getServer(server.id);
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
              err instanceof Error
                ? err.message
                : "Не удалось обновить статус",
          }));
        }
      }, 2000);
      pollingRef.current.set(server.id, interval);
    },
    [clearCardError, showNotification],
  );

  const pageState: PageState = loading
    ? "loading"
    : loadError
      ? "error"
      : servers.length === 0
        ? "empty"
        : "ready";

  if (pageState === "loading") {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-background-200 bg-background-50 overflow-hidden animate-fade-in"
            >
              <div className="px-4 py-3.5 border-b border-background-100 flex items-center gap-2.5">
                <div className="animate-skeleton w-9 h-9 rounded-lg shrink-0"></div>
                <div className="space-y-1.5 flex-1">
                  <div className="animate-skeleton h-4 w-28 rounded"></div>
                  <div className="animate-skeleton h-3 w-24 rounded"></div>
                </div>
                <div className="animate-skeleton h-6 w-20 rounded-full"></div>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="animate-skeleton h-3 w-10 rounded"></div>
                    <div className="animate-skeleton h-3 w-32 rounded"></div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-background-100 flex gap-2">
                <div className="animate-skeleton h-7 w-16 rounded-lg"></div>
                <div className="animate-skeleton h-7 w-16 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-cloud-off-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Hetzner недоступен
          </h3>
          <p className="text-sm text-foreground-500 mb-6">
            Не удалось получить данные о серверах. Проверьте подключение или
            попробуйте позже.
          </p>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (pageState === "empty") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
            <i className="ri-server-line text-2xl text-secondary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Нет серверов
          </h3>
          <p className="text-sm text-foreground-500">
            В вашем аккаунте Hetzner пока нет активных VPS. Создайте сервер
            через панель Hetzner, и он появится здесь.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
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

      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-foreground-500">
          {servers.length}{" "}
          {servers.length === 1
            ? "сервер"
            : servers.length >= 2 && servers.length <= 4
              ? "сервера"
              : "серверов"}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

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
  { label: string; color: string; dotColor: string }
> = {
  running: {
    label: "Работает",
    color: "bg-accent-100 text-accent-700",
    dotColor: "bg-accent-500",
  },
  stopped: {
    label: "Остановлен",
    color: "bg-secondary-100 text-secondary-700",
    dotColor: "bg-secondary-400",
  },
  starting: {
    label: "Запуск…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
  stopping: {
    label: "Остановка…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
  restarting: {
    label: "Перезапуск…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
  unknown: {
    label: "Неизвестно",
    color: "bg-secondary-100 text-secondary-700",
    dotColor: "bg-secondary-400",
  },
};

interface CardAction {
  action: PowerActionType;
  label: string;
  icon: string;
  confirmTitle: string;
  confirmText: string;
}

function getAvailableActions(server: Server): CardAction[] {
  switch (server.status) {
    case "running":
      return [
        {
          action: "restart",
          label: "Перезапустить",
          icon: "ri-restart-line",
          confirmTitle: `Перезапустить «${server.name}»?`,
          confirmText:
            "Сервер перезапустится и будет ненадолго недоступен.",
        },
        {
          action: "stop",
          label: "Остановить",
          icon: "ri-stop-circle-line",
          confirmTitle: `Остановить «${server.name}»?`,
          confirmText: "Сервер будет остановлен и станет недоступен.",
        },
      ];
    case "stopped":
    case "unknown":
      return [
        {
          action: "start",
          label: "Запустить",
          icon: "ri-play-circle-line",
          confirmTitle: `Запустить «${server.name}»?`,
          confirmText:
            "Сервер будет запущен. Это может занять несколько секунд.",
        },
      ];
    default:
      return [];
  }
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
  const [menuOpen, setMenuOpen] = useState<PowerActionType | null>(null);

  const config = statusConfig[server.status] ?? statusConfig.unknown;
  const busy = TRANSITIONAL_STATUSES.includes(server.status);
  const availableActions = getAvailableActions(server);

  const handleConfirm = (action: PowerActionType) => {
    setMenuOpen(null);
    onPowerAction(server, action);
  };

  return (
    <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden transition-colors hover:border-background-300">
      <div className="px-4 py-3.5 border-b border-background-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center shrink-0">
            <i className="ri-server-line text-lg text-secondary-600"></i>
          </div>
          <div className="min-w-0">
            <h4 className="font-heading text-sm font-semibold text-foreground-900 truncate">
              {server.name}
            </h4>
            <p className="text-xs text-foreground-500">{server.ip}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${config.color}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${busy ? "animate-pulse" : ""} ${config.dotColor}`}
          ></span>
          {config.label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-1.5">
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
          <span className="text-foreground-500">Диск</span>
          <span className="text-foreground-800 font-medium">
            {server.disk}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">ОС</span>
          <span className="text-foreground-800 font-medium">
            {server.os}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Расположение</span>
          <span className="text-foreground-800 font-medium">
            {server.location}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 pb-1">
          <div className="flex items-start gap-1.5 rounded-md bg-primary-100/60 px-2.5 py-2 text-xs text-primary-700 animate-fade-in">
            <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center shrink-0 mt-px"></i>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-background-100 flex items-center gap-2">
        {availableActions.map((act) => (
          <div key={act.action} className="relative">
            <button
              onClick={() =>
                setMenuOpen(menuOpen === act.action ? null : act.action)
              }
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-background-200 text-foreground-700 hover:bg-background-100 hover:border-background-300 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i
                className={`${act.icon} w-4 h-4 flex items-center justify-center`}
              ></i>
              {act.label}
            </button>
            {menuOpen === act.action && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(null)}
                  aria-hidden="true"
                />
                <div className="absolute left-0 bottom-full mb-2 w-72 rounded-lg border border-background-200 bg-background-50 shadow-lg animate-scale-in z-40">
                  <div className="px-4 py-3">
                    <h5 className="font-heading text-sm font-semibold text-foreground-900 mb-1">
                      {act.confirmTitle}
                    </h5>
                    <p className="text-xs text-foreground-600 mb-3">
                      {act.confirmText}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMenuOpen(null)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:bg-background-100 border border-background-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={() => handleConfirm(act.action)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-background-50 bg-primary-500 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Подтвердить
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {availableActions.length === 0 && !busy && (
          <span className="text-xs text-foreground-400">
            Нет доступных действий
          </span>
        )}
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-foreground-500">
            <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
            Выполняется...
          </span>
        )}
      </div>
    </div>
  );
}
