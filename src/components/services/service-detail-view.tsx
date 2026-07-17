"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Activity, Pencil, RefreshCw, Trash2 } from "lucide-react";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Service } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { servicesApi, type ServiceCheckDto } from "./api";
import { DeleteServiceDialog } from "./delete-service-dialog";
import {
  formatDateTime,
  formatRelativeTime,
  formatResponseTime,
  formatTarget,
  MONITOR_TYPE_LABELS,
} from "./format";
import {
  ServiceFormDialog,
  type ServiceFormDialogState,
} from "./service-form-dialog";
import { ServiceStatusBadge } from "./service-status-badge";

const POLL_INTERVAL_MS = 10000;
const CHECKS_PAGE_SIZE = 50;
const HEARTBEAT_BAR_COUNT = 50;

// Service detail page (plan.md "Frontend"): status/config summary, manual
// check trigger, and check history (heartbeat strip + paginated table).
// `initialService` is prop-driven like ServicesView; the check history is
// client-fetched (servicesApi.listChecks) since "Load more" needs client
// state that a server re-render alone can't provide.
export function ServiceDetailView({
  initialService,
}: {
  initialService: Service;
}) {
  const router = useRouter();
  const service = initialService;

  const [formState, setFormState] = useState<ServiceFormDialogState | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [checks, setChecks] = useState<ServiceCheckDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingChecks, setLoadingChecks] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [checksError, setChecksError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoadingChecks(true);
    setChecksError(null);
    try {
      const result = await servicesApi.listChecks(service.id, {
        pageSize: CHECKS_PAGE_SIZE,
      });
      setChecks(result.items);
      setNextCursor(result.nextCursor);
    } catch {
      setChecksError("Не удалось загрузить историю проверок.");
    } finally {
      setLoadingChecks(false);
    }
  }, [service.id]);

  // Data fetch runs from a locally-defined async function rather than
  // directly in the effect body, so the loading/error resets aren't flagged
  // as a synchronous setState-in-effect (react-hooks/set-state-in-effect) —
  // same pattern as alerts/alerts-view.tsx's initial fetch.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingChecks(true);
      setChecksError(null);
      try {
        const result = await servicesApi.listChecks(service.id, {
          pageSize: CHECKS_PAGE_SIZE,
        });
        if (cancelled) return;
        setChecks(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (!cancelled)
          setChecksError("Не удалось загрузить историю проверок.");
      } finally {
        if (!cancelled) setLoadingChecks(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [service.id]);

  // Same ~10s polling as ServicesView, paused while the tab is hidden.
  // Resets the checks list back to its first page on every tick — a
  // deliberate simplification (Simplicity First) so "live" history doesn't
  // require merging/deduping against whatever extra pages "Load more" has
  // pulled in.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
        loadFirstPage();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router, loadFirstPage]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await servicesApi.listChecks(service.id, {
        cursor: nextCursor,
        pageSize: CHECKS_PAGE_SIZE,
      });
      setChecks((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      setChecksError("Не удалось загрузить историю проверок.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCheckNow() {
    setChecking(true);
    setCheckError(null);
    try {
      await servicesApi.checkNow(service.id);
      router.refresh();
      loadFirstPage();
    } catch (err) {
      setCheckError(
        err instanceof Error ? err.message : "Не удалось выполнить проверку",
      );
    } finally {
      setChecking(false);
    }
  }

  const heartbeatChecks = checks.slice(0, HEARTBEAT_BAR_COUNT).reverse();

  return (
    <PageBody>
      <PageHeader back={{ href: "/services", label: "Назад к сервисам" }} />

      <div className="rounded-xl border border-background-200 bg-background-50 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-semibold text-foreground-900 truncate">
              {service.name}
            </h1>
            {service.description && (
              <p className="text-sm text-foreground-500">
                {service.description}
              </p>
            )}
          </div>
          <ServiceStatusBadge
            status={service.currentStatus}
            className="shrink-0"
          />
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-foreground-500">Тип монитора</dt>
            <dd className="font-medium text-foreground-800">
              {MONITOR_TYPE_LABELS[service.monitorType]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-foreground-500">Цель</dt>
            <dd className="font-medium text-foreground-800 truncate">
              {formatTarget(service)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Интервал</dt>
            <dd className="font-medium text-foreground-800">
              {service.intervalSeconds} с
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Таймаут</dt>
            <dd className="font-medium text-foreground-800">
              {service.timeoutMs} мс
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Попыток до сбоя</dt>
            <dd className="font-medium text-foreground-800">
              {service.retries}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Последняя проверка</dt>
            <dd className="font-medium text-foreground-800">
              {formatRelativeTime(service.lastCheckedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Время отклика</dt>
            <dd className="font-medium text-foreground-800">
              {formatResponseTime(service.lastResponseTimeMs)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-500">Мониторинг</dt>
            <dd className="font-medium text-foreground-800">
              {service.isActive ? "Включен" : "Отключен"}
            </dd>
          </div>
          {service.monitorType === "HTTP" && service.expectedStatusCodes && (
            <div>
              <dt className="text-xs text-foreground-500">Ожидаемые коды</dt>
              <dd className="font-medium text-foreground-800">
                {service.expectedStatusCodes}
              </dd>
            </div>
          )}
        </dl>

        {service.lastMessage && (
          <p
            className={cn(
              "text-sm",
              service.currentStatus === "DOWN"
                ? "text-(--error-text)"
                : "text-foreground-600",
            )}
          >
            {service.lastMessage}
          </p>
        )}

        {checkError && (
          <Alert variant="error">
            <AlertDescription>{checkError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleCheckNow} disabled={checking}>
            {checking ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <RefreshCw aria-hidden data-icon="inline-start" />
            )}
            Проверить сейчас
          </Button>
          <Button
            variant="outline"
            onClick={() => setFormState({ mode: "edit", service })}
          >
            <Pencil aria-hidden className="size-4" />
            Редактировать
          </Button>
          <Button variant="outline" onClick={() => setDeleteTarget(service)}>
            <Trash2 aria-hidden className="size-4" />
            Удалить
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-background-200 bg-background-50 p-5 flex flex-col gap-4">
        <h2 className="font-heading text-sm font-semibold text-foreground-900">
          История проверок
        </h2>

        {loadingChecks ? (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden />
            Загрузка…
          </div>
        ) : (
          <>
            {heartbeatChecks.length > 0 ? (
              <div
                className="flex items-end gap-0.5"
                role="img"
                aria-label="Полоса последних проверок: зелёный — работает, красный — недоступен"
              >
                {heartbeatChecks.map((check) => (
                  <span
                    key={check.id}
                    title={`${formatDateTime(check.checkedAt)} — ${
                      check.status === "UP" ? "Работает" : "Недоступен"
                    }${
                      check.responseTimeMs !== null
                        ? `, ${check.responseTimeMs} мс`
                        : ""
                    }`}
                    className={cn(
                      "h-8 min-w-[4px] flex-1 rounded-sm",
                      check.status === "UP"
                        ? "bg-accent-500"
                        : "bg-primary-500",
                    )}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                size="sm"
                icon={Activity}
                title="Нет проверок"
                description="История проверок пока пуста."
              />
            )}

            {checksError && (
              <Alert variant="error">
                <AlertDescription>{checksError}</AlertDescription>
              </Alert>
            )}

            {checks.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Отклик</TableHead>
                    <TableHead>Сообщение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="font-mono text-muted-foreground">
                        {formatDateTime(check.checkedAt)}
                      </TableCell>
                      <TableCell>
                        <ServiceStatusBadge status={check.status} />
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatResponseTime(check.responseTimeMs)}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {check.message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {nextCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="self-center"
              >
                {loadingMore ? (
                  <>
                    <Spinner aria-hidden data-icon="inline-start" />
                    Загрузка…
                  </>
                ) : (
                  "Показать ещё"
                )}
              </Button>
            )}
          </>
        )}
      </div>

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
          router.push("/services");
        }}
      />
    </PageBody>
  );
}
