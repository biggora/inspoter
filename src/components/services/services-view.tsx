"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityCardHeader } from "@/components/ui/entity-card-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import { Spinner } from "@/components/ui/spinner";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import type { Service } from "@/generated/prisma/client";
import type { ServiceOverviewItem } from "@/lib/services/services";
import { servicesApi, type ServiceLabelListItemDto } from "./api";
import { DeleteServiceDialog } from "./delete-service-dialog";
import { filterServices } from "./filter";
import {
  parseServicesFilters,
  serviceDetailHref,
  servicesListSearch,
  type ServicesFilters,
} from "./list-params";
import { ServiceLabelPicker } from "./label-picker";
import { ManageServiceLabelsDialog } from "./manage-labels-dialog";
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
  initialLabels,
}: {
  initialServices: ServiceOverviewItem[];
  initialLabels: ServiceLabelListItemDto[];
}) {
  const t = useTranslations("services");
  const router = useRouter();
  const services = initialServices;
  const labels = initialLabels;

  const [formState, setFormState] = useState<ServiceFormDialogState | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  // The URL seeds the filters once, on mount: it is the persisted mirror of
  // this state, not a second source of truth competing with the debounce
  // buffer below.
  const initialFilters = parseServicesFilters(useSearchParams());
  const [searchInput, setSearchInput] = useState(initialFilters.query);
  const [query, setQuery] = useState(initialFilters.query);
  const [filterLabelIds, setFilterLabelIds] = useState<string[]>(
    initialFilters.labelIds,
  );

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const filters = useMemo<ServicesFilters>(
    () => ({ query, labelIds: filterLabelIds }),
    [query, filterLabelIds],
  );

  const visibleServices = useMemo(
    () => filterServices(services, filters),
    [services, filters],
  );

  // Filtering is client-side over an already-loaded list, so the URL is kept
  // in step without a navigation: a router.push here would re-run
  // listOverview for a payload that cannot have changed. The path comes from
  // window.location, which carries the locale prefix that next-intl's
  // usePathname strips.
  useEffect(() => {
    const search = servicesListSearch(filters);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }, [filters]);

  const hasActiveFilters = query !== "" || filterLabelIds.length > 0;

  function resetFilters() {
    setSearchInput("");
    setQuery("");
    setFilterLabelIds([]);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const clearCardError = useCallback((id: string) => {
    setCardErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleCheckNow = useCallback(
    async (service: Service) => {
      setCheckingIds((prev) => new Set(prev).add(service.id));
      clearCardError(service.id);
      try {
        await servicesApi.checkNow(service.id);
        router.refresh();
      } catch (err) {
        setCardErrors((prev) => ({
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
    [clearCardError, router, t],
  );

  const handleToggleActive = useCallback(
    async (service: Service) => {
      const nextActive = !service.isActive;
      setTogglingIds((prev) => new Set(prev).add(service.id));
      clearCardError(service.id);
      try {
        await servicesApi.setActive(service.id, nextActive);
        toast.success(t(nextActive ? "resumedToast" : "pausedToast"));
        router.refresh();
      } catch (err) {
        setCardErrors((prev) => ({
          ...prev,
          [service.id]:
            err instanceof Error ? err.message : t("toggleActiveError"),
        }));
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(service.id);
          return next;
        });
      }
    },
    [clearCardError, router, t],
  );

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        description={t("count", { count: services.length })}
        actions={
          <>
            <Button variant="outline" onClick={() => setManageLabelsOpen(true)}>
              <Icon
                name="ri-price-tag-3-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("manageLabelsButton")}
            </Button>
            <Button onClick={() => setFormState({ mode: "create" })}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("newServiceButton")}
            </Button>
          </>
        }
      >
        {services.length > 0 && (
          <FilterBar>
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="sm:max-w-xs"
            />
            <ServiceLabelPicker
              labels={labels}
              selectedIds={filterLabelIds}
              onChange={setFilterLabelIds}
              triggerLabel={
                filterLabelIds.length > 0
                  ? t("labelFilterActive", { count: filterLabelIds.length })
                  : t("labelFilterLabel")
              }
              title={t("labelFilterTitle")}
              description={t("labelFilterDescription")}
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <Icon
                  name="ri-close-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("resetFiltersButton")}
              </Button>
            )}
          </FilterBar>
        )}
      </PageHeader>

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
      ) : visibleServices.length === 0 ? (
        <EmptyState
          icon="ri-search-line"
          title={t("noResultsTitle")}
          description={t("noResultsDescription")}
          action={
            <Button variant="outline" onClick={resetFilters}>
              <Icon name="ri-close-line" aria-hidden data-icon="inline-start" />
              {t("resetFiltersButton")}
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {visibleServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              filters={filters}
              checking={checkingIds.has(service.id)}
              toggling={togglingIds.has(service.id)}
              error={cardErrors[service.id]}
              onCheckNow={() => handleCheckNow(service)}
              onToggleActive={() => handleToggleActive(service)}
              onEdit={() => setFormState({ mode: "edit", service })}
              onDelete={() => setDeleteTarget(service)}
            />
          ))}
        </CardGrid>
      )}

      <ServiceFormDialog
        state={formState}
        labels={labels}
        onOpenChange={(open) => !open && setFormState(null)}
        onSaved={() => {
          setFormState(null);
          router.refresh();
        }}
      />
      <ManageServiceLabelsDialog
        open={manageLabelsOpen}
        onOpenChange={setManageLabelsOpen}
        labels={labels}
        onChanged={(change) => {
          if (change?.deletedId) {
            setFilterLabelIds((prev) =>
              prev.filter((id) => id !== change.deletedId),
            );
          }
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
  filters,
  checking,
  toggling,
  error,
  onCheckNow,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  service: ServiceOverviewItem;
  /** The filtered list this card belongs to, carried into its link. */
  filters: ServicesFilters;
  checking: boolean;
  toggling: boolean;
  error?: string;
  onCheckNow: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("services");
  const tStatus = useTranslations("status");
  const format = useFormatter();
  const monitorIconClass =
    MONITOR_TYPE_ICONS[service.monitorType] ?? "ri-global-line";
  const historyChecks = [...service.checks].reverse();

  return (
    <Card size="sm">
      <EntityCardHeader
        icon={monitorIconClass}
        title={service.name}
        description={
          <>
            {getMonitorTypeLabel(service.monitorType, t)} ·{" "}
            {formatTarget(service)}
          </>
        }
        descriptionClassName="truncate"
        render={<Link href={serviceDetailHref(service.id, filters)} />}
        action={
          <ServiceStatusBadge
            status={service.currentStatus}
            isActive={service.isActive}
            className="shrink-0"
          />
        }
      />

      <CardContent className="flex flex-col gap-1.5">
        {service.labels.length > 0 && (
          <div
            className="flex flex-wrap gap-1"
            aria-label={t("serviceLabelsAriaLabel", { name: service.name })}
          >
            {service.labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
          </div>
        )}
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
                    check.status === "UP" ? tStatus("up") : tStatus("down")
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

      {/* flex-wrap: four controls do not fit the 288px minimum card width,
          and CardFooter is a plain non-wrapping flex row. */}
      <CardFooter className="gap-1 flex-wrap gap-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckNow}
          disabled={checking}
        >
          {checking ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
          )}
          {t("checkNowButton")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleActive}
          disabled={toggling}
          className="mr-auto"
        >
          {toggling ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <Icon
              name={
                service.isActive
                  ? "ri-pause-circle-line"
                  : "ri-play-circle-line"
              }
              aria-hidden
              data-icon="inline-start"
            />
          )}
          {toggling
            ? t(service.isActive ? "pausingLabel" : "resumingLabel")
            : t(service.isActive ? "pauseAction" : "resumeAction")}
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
