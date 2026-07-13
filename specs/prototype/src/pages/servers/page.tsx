import { useState, useEffect, useCallback } from "react";
import { mockServers } from "@/mocks/servers";
import type { Server, ServerStatus } from "@/mocks/servers";
import ServerCard from "./components/ServerCard";

type PageState = "loading" | "error" | "empty" | "ready";

const transitionalMap: Record<string, ServerStatus> = {
  start: "starting",
  stop: "stopping",
  restart: "restarting",
};

const resultMap: Record<string, ServerStatus> = {
  start: "running",
  stop: "stopped",
  restart: "running",
};

type CardError = { serverId: string; message: string };

interface NotificationState {
  message: string;
  variant: "success" | "error";
}

export default function ServersPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [servers, setServers] = useState<Server[]>([]);
  const [cardErrors, setCardErrors] = useState<CardError[]>([]);
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadServers = useCallback(() => {
    setPageState("loading");
    setCardErrors([]);
    // Simulate API call
    setTimeout(() => {
      const shouldFail = false;
      if (shouldFail) {
        setPageState("error");
      } else if (mockServers.length === 0) {
        setPageState("empty");
      } else {
        setServers(mockServers.map((s) => ({ ...s })));
        setPageState("ready");
      }
    }, 800);
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const showNotification = useCallback(
    (message: string, variant: "success" | "error") => {
      setNotification({ message, variant });
    },
    [],
  );

  const clearCardError = useCallback((serverId: string) => {
    setCardErrors((prev) => prev.filter((e) => e.serverId !== serverId));
  }, []);

  const handlePowerAction = useCallback(
    (serverId: string, action: "start" | "stop" | "restart") => {
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;

      clearCardError(serverId);

      const previousStatus = server.status;
      const transitionalStatus = transitionalMap[action];

      // Set transitional status
      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId ? { ...s, status: transitionalStatus } : s,
        ),
      );

      // Simulate API delay
      const delay = 1500 + Math.random() * 1500;
      setTimeout(() => {
        // ~15% chance of failure for demo
        const shouldFail = Math.random() < 0.15;

        if (shouldFail) {
          // Rollback to previous status
          setServers((prev) =>
            prev.map((s) =>
              s.id === serverId ? { ...s, status: previousStatus } : s,
            ),
          );
          setCardErrors((prev) => [
            ...prev.filter((e) => e.serverId !== serverId),
            {
              serverId,
              message:
                action === "start"
                  ? "Не удалось запустить сервер. Проверьте доступность и попробуйте снова."
                  : action === "stop"
                    ? "Не удалось остановить сервер. Возможно, он уже находится в процессе остановки."
                    : "Не удалось перезагрузить сервер. Попробуйте позже.",
            },
          ]);
          showNotification(
            `Ошибка: не удалось ${action === "start" ? "запустить" : action === "stop" ? "остановить" : "перезагрузить"} «${server.name}».`,
            "error",
          );
        } else {
          // Success
          const resultStatus = resultMap[action];
          setServers((prev) =>
            prev.map((s) =>
              s.id === serverId ? { ...s, status: resultStatus } : s,
            ),
          );
          showNotification(
            `Сервер «${server.name}» ${action === "start" ? "запущен" : action === "stop" ? "остановлен" : "перезагружен"}.`,
            "success",
          );
        }
      }, delay);
    },
    [servers, clearCardError, showNotification],
  );

  const getCardError = (serverId: string): string | null => {
    const err = cardErrors.find((e) => e.serverId === serverId);
    return err ? err.message : null;
  };

  // Loading skeletons
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

  // Error state — Hetzner unavailable
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
            onClick={loadServers}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (pageState === "empty" || servers.length === 0) {
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

  // Ready state
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
          onClick={loadServers}
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
            error={getCardError(server.id)}
          />
        ))}
      </div>
    </div>
  );
}
