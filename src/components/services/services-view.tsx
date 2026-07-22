"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import type { Service } from "@/generated/prisma/client";
import type { ServiceOverviewItem } from "@/lib/services/services";
import { servicesApi } from "./api";
import { DeleteServiceDialog } from "./delete-service-dialog";
import {
  formatDateTime,
  formatRelativeTime,
  formatResponseTime,
  formatTarget,
  getMonitorTypeLabel,
} from "./format";
import {
  ServiceFormDialog,
  type ServiceFormDialogState,
} from "./service-form-dialog";
import { ServiceStatusBadge } from "./service-status-badge";

const POLL_INTERVAL_MS = 10000;

const MONITOR_TYPE_ICONS = {
  HTTP: "ri-global-line",
  TCP: "ri-router-line",
  PING: "ri-pulse-line",
} as const;

// Services list (plan.md "Frontend"). Card grid modeled on
// servers/servers-view.tsx (status badge top-right, stat rows, footer
// actions), driven by router.refresh() instead of client-held state — the
// `initialServices` prop is the source of truth (see
// bookmarks/bookmarks-board.tsx's comment on this convention).
export function ServicesView({
  initialServices,
}: {
  initialServices: ServiceOverviewItem[];
}) {
  const t = useTranslations("services");
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
          [service.id]: err instanceof Error ? err.message : t("checkNowError"),
        }));
      } finally {
        setCheckingIds((prev) => {
          const next = new Set(prev);
          next.delete(service.id);
          return next;
        });
      }
    },
    [router, t],
  );

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        description={t("count", { count: services.length })}
        actions={
          <Button onClick={() => setFormState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("newServiceButton")}
          </Button>
        }
      />

      {services.length === 0 ? (
        <EmptyState
          icon="ri-pulse-line"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setFormState({ mode: "create" })}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("createServiceButton")}
            </Button>
          }
        />
      ) : (
        <CardGrid>
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
        </CardGrid>
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
    </PageBody>
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
  service: ServiceOverviewItem;
  checking: boolean;
  error?: string;
  onCheckNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("services");
  const format = useFormatter();
  const monitorIconClass =
    MONITOR_TYPE_ICONS[service.monitorType] ?? "ri-global-line";
  const historyChecks = [...service.checks].reverse();

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <Link
          href={`/services/${service.id}`}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100">
            <Icon
              name={monitorIconClass}
              aria-hidden
              className="text-base text-secondary-600"
            />
          </div>
          <div className="min-w-0">
            <CardTitle>
              <h2 className="truncate">{service.name}</h2>
            </CardTitle>
            <CardDescription className="truncate text-xs">
              {getMonitorTypeLabel(service.monitorType, t)} ·{" "}
              {formatTarget(service)}
            </CardDescription>
          </div>
        </Link>
        <CardAction>
          <ServiceStatusBadge
            status={service.currentStatus}
            className="shrink-0"
          />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("lastCheckedLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {formatRelativeTime(service.lastCheckedAt, t, format)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-500">{t("responseTimeLabel")}</span>
          <span className="text-foreground-800 font-medium">
            {formatResponseTime(service.lastResponseTimeMs, t)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="shrink-0 text-foreground-500">
            {t("checkHistoryTitle")}
          </span>
          {historyChecks.length > 0 ? (
            <div
              className="flex min-w-0 flex-1 items-center justify-end gap-0.5"
              role="img"
              aria-label={`${service.name}: ${t("heartbeatAriaLabel")}`}
            >
              {historyChecks.map((check) => (
                <span
                  key={check.id}
                  title={`${formatDateTime(check.checkedAt, format)} — ${
                    check.status === "UP" ? t("statusUp") : t("statusDown")
                  }${
                    check.responseTimeMs !== null
                      ? `, ${t("msValue", { value: check.responseTimeMs })}`
                      : ""
                  }`}
                  className={`h-3 min-w-0 max-w-2 flex-1 rounded-[2px] ${
                    check.status === "UP" ? "bg-accent-500" : "bg-primary-500"
                  }`}
                />
              ))}
            </div>
          ) : (
            <span className="text-foreground-800 font-medium">
              {t("emptyChecksTitle")}
            </span>
          )}
        </div>
        {!service.isActive && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-500">
              {t("monitoringStatusLabel")}
            </span>
            <span className="text-foreground-800 font-medium">
              {t("disabledLabel")}
            </span>
          </div>
        )}
        {service.lastMessage && service.currentStatus === "DOWN" && (
          <p
            className="text-xs text-(--error-text) truncate"
            title={service.lastMessage}
          >
            {service.lastMessage}
          </p>
        )}
        {error && (
          <Alert variant="error" className="mt-1">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckNow}
          disabled={checking}
          className="mr-auto"
        >
          {checking ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
          )}
          {t("checkNowButton")}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={t("editServiceAria", { name: service.name })}
        >
          <Icon name="ri-edit-line" aria-hidden data-icon="inline-start" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={t("deleteServiceAria", { name: service.name })}
        >
          <Icon
            name="ri-delete-bin-line"
            aria-hidden
            data-icon="inline-start"
          />
        </Button>
      </CardFooter>
    </Card>
  );
}
