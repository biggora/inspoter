"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWebMcpTool } from "@/hooks/use-web-mcp-tool";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Pagination } from "@/components/shell/pagination";
import { notifyUnreadCountsStale } from "@/components/shell/notifications-api";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import { TableSkeleton } from "@/components/ui/skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreateTaskDialog,
  type CreateTaskTarget,
} from "@/components/kanban/create-task-dialog";
import {
  alertCategoriesApi,
  alertsApi,
  fetchAlerts,
  UNCATEGORIZED_FILTER,
  type AlertCategoryDto,
  type AlertDto,
} from "./api";
import {
  CategoryFormDialog,
  type CategoryFormState,
} from "./category-form-dialog";
import { DeleteAlertDialog } from "./delete-alert-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { alertMessage, categoryLabel } from "./localize";
import { ManageCategoriesDialog } from "./manage-categories-dialog";
import { SeverityBadge } from "./severity-badge";
import { createSetCategoryTool } from "./web-mcp-tools";

const SEVERITY_KEYS: Record<string, string> = {
  all: "severityAllOption",
  info: "severityInfoOption",
  warning: "severityWarningOption",
  error: "severityErrorOption",
  critical: "severityCriticalOption",
};

const SORT_KEYS: Record<string, string> = {
  desc: "sortDescOption",
  asc: "sortAscOption",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Alerts list (design.md §6.6, AC-ALR-001..006). Fetched client-side (same
// rationale as Logs — filterable/paginated). Category CRUD lives alongside
// the list rather than as a separate page since Alerts has no persistent
// category-tree screen.
export function AlertsView({ initialDate = "" }: { initialDate?: string }) {
  const t = useTranslations("alerts");
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [date, setDate] = useState(initialDate);

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const [items, setItems] = useState<AlertDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<AlertCategoryDto[]>([]);
  const [categoryDialog, setCategoryDialog] =
    useState<CategoryFormState | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AlertCategoryDto | null>(
    null,
  );
  const [deleteAlertTarget, setDeleteAlertTarget] = useState<AlertDto | null>(
    null,
  );
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [taskTarget, setTaskTarget] = useState<CreateTaskTarget | null>(null);

  // Bumped after a mutation to re-run the list effect; the alternative
  // (splicing rows locally) would drift from the active filters — deleting an
  // alert can change which page the cursor points at.
  const [reloadToken, setReloadToken] = useState(0);

  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(
    null,
  );
  const [highlightFading, setHighlightFading] = useState(false);
  const alertRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  function loadCategories() {
    alertCategoriesApi
      .list()
      .then(setCategories)
      .catch(() => {
        // Category-load failure only degrades the filter/manage UI; the
        // main list still works without it.
      });
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useWebMcpTool(
    createSetCategoryTool({
      setCategoryBulk: alertsApi.setCategoryBulk,
      refresh: () => setReloadToken((prev) => prev + 1),
    }),
  );

  // Reaching this section is the acknowledgement: the operator is looking at
  // the list, so the topbar indicator has nothing left to report. Fire and
  // forget — a failed call only means the badge clears a minute later, which
  // is not worth a toast.
  useEffect(() => {
    alertsApi
      .markAllRead()
      .then(notifyUnreadCountsStale)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const highlightId = searchParams.get("highlightAlertId");
      if (highlightId && !cancelled) {
        setHighlightedAlertId(highlightId);
        setHighlightFading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const currentCursor = pageCursors[pageIndex];

  // Data fetch runs from a locally-defined async function rather than
  // directly in the effect body, so the loading/error resets aren't flagged
  // as a synchronous setState-in-effect (react-hooks/set-state-in-effect) —
  // the effect itself only *starts* the load; the resulting state updates
  // are the async synchronization the rule expects.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAlerts({
          cursor: currentCursor,
          categoryId: categoryId === "all" ? undefined : categoryId,
          severity: severity === "all" ? undefined : severity,
          query: query || undefined,
          sort,
          date: date || undefined,
        });
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (!cancelled) setError(t("loadAlertsError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentCursor, categoryId, severity, query, sort, date, reloadToken, t]);

  useEffect(() => {
    if (!highlightedAlertId) return;

    const rowElement = alertRowRefs.current[highlightedAlertId];
    if (!rowElement) return;

    rowElement.scrollIntoView({ behavior: "smooth", block: "center" });

    const fadeTimer = setTimeout(() => {
      setHighlightFading(true);
    }, 5000);

    return () => clearTimeout(fadeTimer);
  }, [highlightedAlertId]);

  function resetToFirstPage() {
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    resetToFirstPage();
  }

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    resetToFirstPage();
  }

  function handleSeverityChange(value: string) {
    setSeverity(value);
    resetToFirstPage();
  }

  function handleSortChange(value: "asc" | "desc") {
    setSort(value);
    resetToFirstPage();
  }

  function handleDateChange(value: string) {
    setDate(value);
    resetToFirstPage();
  }

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  function handleCategorySaved() {
    setCategoryDialog(null);
    loadCategories();
  }

  function handleCategoryDeleted() {
    setDeleteTarget(null);
    if (categoryId === deleteTarget?.id) setCategoryId("all");
    loadCategories();
    setReloadToken((prev) => prev + 1);
  }

  function handleAlertDeleted() {
    setDeleteAlertTarget(null);
    setReloadToken((prev) => prev + 1);
  }

  async function handleAssignCategory(alertId: string, value: string) {
    setAssigningId(alertId);
    try {
      const updated = await alertsApi.setCategory(
        alertId,
        value === UNCATEGORIZED_FILTER ? null : value,
      );
      // The row is patched in place instead of refetching: the alert may no
      // longer match an active category filter, and yanking it out from under
      // the pointer the moment it is reassigned reads as a bug.
      setItems((prev) =>
        prev.map((item) => (item.id === alertId ? updated : item)),
      );
      toast.success(t("categoryAssignedToast"));
    } catch {
      toast.error(t("assignCategoryError"));
    } finally {
      setAssigningId(null);
    }
  }

  const namedCategories = categories.map(
    (c) => [c.id, categoryLabel(c, t)] as const,
  );

  const categoryItems: Record<string, string> = {
    all: t("allCategoriesOption"),
    [UNCATEGORIZED_FILTER]: t("uncategorizedOption"),
    ...Object.fromEntries(namedCategories),
  };

  // Same options minus "all": a row is either in one category or in none.
  const assignItems: Record<string, string> = {
    [UNCATEGORIZED_FILTER]: t("uncategorizedOption"),
    ...Object.fromEntries(namedCategories),
  };

  const severityItems: Record<string, string> = Object.fromEntries(
    Object.entries(SEVERITY_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const sortItems: Record<string, string> = Object.fromEntries(
    Object.entries(SORT_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const hasActiveFilters =
    query !== "" || categoryId !== "all" || severity !== "all" || date !== "";

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <Icon
                name="ri-settings-3-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("manageCategoriesButton")}
            </Button>
            <Button onClick={() => setCategoryDialog({ mode: "create" })}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("newCategoryButton")}
            </Button>
          </>
        }
      >
        <FilterBar>
          <Input
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="sm:max-w-xs"
          />
          <Select
            value={categoryId}
            onValueChange={(v) => handleCategoryChange(v as string)}
            items={categoryItems}
          >
            <SelectTrigger size="sm" aria-label={t("categoryFilterLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(categoryItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={severity}
            onValueChange={(v) => handleSeverityChange(v as string)}
            items={severityItems}
          >
            <SelectTrigger size="sm" aria-label={t("severityFilterLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(severityItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => handleSortChange(v as "asc" | "desc")}
            items={sortItems}
          >
            <SelectTrigger size="sm" aria-label={t("sortOrderLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(sortItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            type="date"
            size="sm"
            value={date}
            onChange={(event) => handleDateChange(event.target.value)}
            aria-label={t("dateFilterLabel")}
            className="sm:w-auto"
          />
        </FilterBar>
      </PageHeader>

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* The skeleton is for the first load only: a refetch (page turn, filter
          change) keeps the confirmed rows and dims them instead. */}
      {loading && items.length === 0 ? (
        <LoadingRegion>
          <TableSkeleton rows={4} />
        </LoadingRegion>
      ) : items.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState description={t("noResultsDescription")} />
        ) : (
          <EmptyState
            icon="ri-notification-3-line"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <pre className="mt-2 w-full max-w-xl overflow-x-auto rounded-md bg-background-100 p-4 text-left text-xs">
                {`curl -X POST http://your-host/api/webhooks/alert \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"category":"deploy","severity":"warning","source":"test","message":"Hello"}'`}
              </pre>
            }
          />
        )
      ) : (
        <LoadingOverlay busy={loading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("severityColumn")}</TableHead>
                <TableHead>{t("categoryColumn")}</TableHead>
                <TableHead>{t("sourceColumn")}</TableHead>
                <TableHead>{t("messageColumn")}</TableHead>
                <TableHead>{t("timeColumn")}</TableHead>
                <TableHead className="sr-only">{t("actionsColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((alert) => (
                <TableRow
                  key={alert.id}
                  data-alert-id={alert.id}
                  ref={(el) => {
                    if (el) alertRowRefs.current[alert.id] = el;
                  }}
                  className={`transition-all ${
                    highlightedAlertId === alert.id
                      ? highlightFading
                        ? "opacity-50 border-l-4 border-primary"
                        : "opacity-100 border-l-4 border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <TableCell>
                    <SeverityBadge severity={alert.severity} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={alert.alertCategoryId ?? UNCATEGORIZED_FILTER}
                      onValueChange={(v) =>
                        handleAssignCategory(alert.id, v as string)
                      }
                      items={assignItems}
                      disabled={assigningId === alert.id}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t("assignCategoryLabel")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.entries(assignItems).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {/* Provenance is only worth showing when a machine chose
                        it — WEBHOOK and MANUAL are the unremarkable cases. */}
                    {(alert.categorySource === "MODEL" ||
                      alert.categorySource === "RULE") && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {alert.categorySource === "MODEL"
                          ? t("categorySourceModelLabel")
                          : t("categorySourceRuleLabel")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{alert.source}</TableCell>
                  <TableCell className="max-w-md truncate font-mono">
                    {alertMessage(alert, t)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatTimestamp(alert.timestamp)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Files the alert as a kanban task, linked back to it.
                        Triage often ends in "someone has to fix this later",
                        which had nowhere to go before the Kanban section. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("createTaskLabel")}
                      title={t("createTaskLabel")}
                      onClick={() =>
                        setTaskTarget({
                          title: alertMessage(alert, t),
                          linkedType: "ALERT",
                          linkedId: alert.id,
                          linkedLabel: alertMessage(alert, t),
                        })
                      }
                    >
                      <Icon name="ri-add-box-line" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("deleteAlertLabel")}
                      onClick={() => setDeleteAlertTarget(alert)}
                    >
                      <Icon name="ri-delete-bin-line" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadingOverlay>
      )}

      <Pagination
        page={pageIndex + 1}
        hasPrevious={pageIndex > 0}
        hasNext={Boolean(nextCursor)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        disabled={loading}
      />

      <CategoryFormDialog
        state={categoryDialog}
        onOpenChange={(open) => !open && setCategoryDialog(null)}
        onSaved={handleCategorySaved}
      />
      <ManageCategoriesDialog
        open={manageOpen}
        categories={categories}
        onOpenChange={setManageOpen}
        onRename={(category) => setCategoryDialog({ mode: "edit", category })}
        onDelete={(category) => setDeleteTarget(category)}
      />
      <DeleteCategoryDialog
        category={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={handleCategoryDeleted}
      />
      <DeleteAlertDialog
        alert={deleteAlertTarget}
        onOpenChange={(open) => !open && setDeleteAlertTarget(null)}
        onDeleted={handleAlertDeleted}
      />
      <CreateTaskDialog
        target={taskTarget}
        onOpenChange={(open) => !open && setTaskTarget(null)}
      />
    </PageBody>
  );
}
