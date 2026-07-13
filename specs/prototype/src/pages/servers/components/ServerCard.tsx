import { useState } from "react";
import type { Server, ServerStatus } from "@/mocks/servers";

interface ServerCardProps {
  server: Server;
  onPowerAction: (
    serverId: string,
    action: "start" | "stop" | "restart",
  ) => void;
  error: string | null;
}

const statusConfig: Record<
  ServerStatus,
  { label: string; color: string; dotColor: string }
> = {
  running: {
    label: "Running",
    color: "bg-accent-100 text-accent-700",
    dotColor: "bg-accent-500",
  },
  stopped: {
    label: "Stopped",
    color: "bg-secondary-100 text-secondary-700",
    dotColor: "bg-secondary-400",
  },
  starting: {
    label: "Starting…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
  stopping: {
    label: "Stopping…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
  restarting: {
    label: "Restarting…",
    color: "bg-primary-100 text-primary-700",
    dotColor: "bg-primary-400",
  },
};

function isTransitional(status: ServerStatus): boolean {
  return (
    status === "starting" || status === "stopping" || status === "restarting"
  );
}

export default function ServerCard({
  server,
  onPowerAction,
  error,
}: ServerCardProps) {
  const [menuOpen, setMenuOpen] = useState<"start" | "stop" | "restart" | null>(
    null,
  );
  const config = statusConfig[server.status];
  const busy = isTransitional(server.status);

  const availableActions: {
    action: "start" | "stop" | "restart";
    label: string;
    icon: string;
    confirmTitle: string;
    confirmText: string;
  }[] = [];

  if (server.status === "running") {
    availableActions.push({
      action: "stop",
      label: "Stop",
      icon: "ri-stop-circle-line",
      confirmTitle: "Остановить сервер",
      confirmText: `Сервер «${server.name}» будет остановлен. Сервисы на нём станут недоступны.`,
    });
    availableActions.push({
      action: "restart",
      label: "Restart",
      icon: "ri-restart-line",
      confirmTitle: "Перезагрузить сервер",
      confirmText: `Сервер «${server.name}» будет перезагружен. Возможна кратковременная недоступность сервисов.`,
    });
  } else if (server.status === "stopped") {
    availableActions.push({
      action: "start",
      label: "Start",
      icon: "ri-play-circle-line",
      confirmTitle: "Запустить сервер",
      confirmText: `Сервер «${server.name}» будет запущен. Сервисы станут доступны в течение минуты.`,
    });
  }

  const handleConfirm = () => {
    if (menuOpen) {
      onPowerAction(server.id, menuOpen);
      setMenuOpen(null);
    }
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
          <span className="text-foreground-800 font-medium">{server.cpu}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">RAM</span>
          <span className="text-foreground-800 font-medium">{server.ram}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Disk</span>
          <span className="text-foreground-800 font-medium">{server.disk}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">OS</span>
          <span className="text-foreground-800 font-medium">{server.os}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Location</span>
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
                        onClick={handleConfirm}
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
