"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Activity, Globe, Loader2, Network, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Service } from "@/generated/prisma/client";
import { servicesApi } from "./api";
import { DeleteServiceDialog } from "./delete-service-dialog";
import {
  formatRelativeTime,
  formatResponseTime,
  formatTarget,
  MONITOR_TYPE_LABELS,
} from "./format";
import { ServiceFormDialog, type ServiceFormDialogState } from "./service-form-dialog";
import { ServiceStatusBadge } from "./service-status-badge";

const POLL_INTERVAL_MS = 10000;

const MONITOR_TYPE_ICONS = {
  HTTP: Globe,
  TCP: Network,
  PING: Activity,
} as const;

function pluralizeServices(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "сервис";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return "сервиса";
  }
  return "сервисов";
}

// Services list (plan.md "Frontend"). Card grid modeled on
// servers/servers-view.tsx (status badge top-right, stat rows, footer
// actions), driven by router.refresh() instead of client-held state — the
// `initialServices` prop is the source of truth (see
// bookmarks/bookmarks-board.tsx's comment on this convention).
export function ServicesView({
  initialServices,
}: {
  initialServices: Service[];
}) {
  const router = useRouter();
  const services = initialServices;

  const [formState, setFormState] = useState<ServiceFormDialogState | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const handleCheckNow = useCallback(
    async (service: Service) => {
      setCheckingIds((prev) => new Set(prev).add(service.id));
      setCheckErrors((prev) => {
        if (!(service.id in prev)) return prev;
        const next = { ...prev };
        delete next[service.id];
        return next;
      });
      try {
        await servicesApi.checkNow(service.id);
        router.refresh();
      } catch (err) {
        setCheckErrors((prev) => ({
          ...prev,
          [service.id]:
            err instanceof Error
              ? err.message
              : "Не удалось выполнить проверку",
        }));
      } finally {
        setCheckingIds((prev) => {
          const next = new Set(prev);
          next.delete(service.id);
          return next;
        });
      }
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Сервисы</h1>
          <p className="text-sm text-muted-foreground">
            {services.length} {pluralizeServices(services.length)}
          </p>
        </div>
        <Button onClick={() => setFormState({ mode: "create" })}>
          <Plus aria-hidden className="size-4" />
          Новый сервис
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-background-200 bg-background-50 px-6 py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center">
            <i className="ri-pulse-line text-2xl text-secondary-600"></i>
          </div>
          <h2 className="font-heading text-lg font-semibold text-foreground-900">
            Нет сервисов
          </h2>
          <p className="max-w-sm text-sm text-foreground-500">
            Добавьте первый сервис — HTTP(S)-эндпоинт, TCP-порт или хост для
            проверки доступности — чтобы начать отслеживать его статус.
          </p>
          <Button onClick={() => setFormState({ mode: "create" })}>
            <Plus aria-hidden className="size-4" />
            Создать сервис
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              checking={checkingIds.has(service.id)}
              error={checkErrors[service.id]}
              onCheckNow={() => handleCheckNow(service)}
              onEdit={() => setFormState({ mode: "edit", service })}
              onDelete={() => setDeleteTarget(service)}
            />
          ))}
        </div>
      )}

      <ServiceFormDialog
        state={formState}
        onOpenChange={(open) => !open && setFormState(null)}
        onSaved={() => {
          setFormState(null);
          router.refresh();
        }}
      />
      <DeleteServiceDialog
        service={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ServiceCard({
  service,
  checking,
  error,
  onCheckNow,
  onEdit,
  onDelete,
}: {
  service: Service;
  checking: boolean;
  error?: string;
  onCheckNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const MonitorIcon = MONITOR_TYPE_ICONS[service.monitorType] ?? Globe;

  return (
    <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden transition-colors hover:border-background-300">
      <div className="px-4 py-3.5 border-b border-background-100 flex items-center justify-between gap-2">
        <Link
          href={`/services/${service.id}`}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center shrink-0">
            <MonitorIcon aria-hidden className="size-4 text-secondary-600" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading text-sm font-semibold text-foreground-900 truncate">
              {service.name}
            </h4>
            <p className="text-xs text-foreground-500 truncate">
              {MONITOR_TYPE_LABELS[service.monitorType]} ·{" "}
              {formatTarget(service)}
            </p>
          </div>
        </Link>
        <ServiceStatusBadge status={service.currentStatus} className="shrink-0" />
      </div>

      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Последняя проверка</span>
          <span className="text-foreground-800 font-medium">
            {formatRelativeTime(service.lastCheckedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">Время отклика</span>
          <span className="text-foreground-800 font-medium">
            {formatResponseTime(service.lastResponseTimeMs)}
          </span>
        </div>
        {!service.isActive && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-500">Статус мониторинга</span>
            <span className="text-foreground-800 font-medium">Отключен</span>
          </div>
        )}
        {service.lastMessage && service.currentStatus === "DOWN" && (
          <p className="text-xs text-(--error-text) truncate" title={service.lastMessage}>
            {service.lastMessage}
          </p>
        )}
      </div>

      {error && (
        <div className="px-4 pb-1">
          <p className="text-xs text-(--error-text)">{error}</p>
        </div>
      )}

      <div className="px-4 py-3 border-t border-background-100 flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckNow}
          disabled={checking}
          className="mr-auto"
        >
          {checking ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="size-4" />
          )}
          Проверить сейчас
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`Редактировать «${service.name}»`}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Удалить «${service.name}»`}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}
