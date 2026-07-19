"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Pagination } from "@/components/shell/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  alertCategoriesApi,
  fetchAlerts,
  type AlertCategoryDto,
  type AlertDto,
} from "./api";
import {
  CategoryFormDialog,
  type CategoryFormState,
} from "./category-form-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { ManageCategoriesDialog } from "./manage-categories-dialog";
import { SeverityBadge } from "./severity-badge";

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
export function AlertsView() {
  const t = useTranslations("alerts");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

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
  }, [currentCursor, categoryId, severity, query, sort, t]);

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
  }

  const categoryItems: Record<string, string> = {
    all: t("allCategoriesOption"),
    ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
  };

  const severityItems: Record<string, string> = Object.fromEntries(
    Object.entries(SEVERITY_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const sortItems: Record<string, string> = Object.fromEntries(
    Object.entries(SORT_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const hasActiveFilters =
    query !== "" || categoryId !== "all" || severity !== "all";

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <Icon name="ri-settings-3-line" aria-hidden data-icon="inline-start" />
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
        </FilterBar>
      </PageHeader>

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("severityColumn")}</TableHead>
              <TableHead>{t("categoryColumn")}</TableHead>
              <TableHead>{t("sourceColumn")}</TableHead>
              <TableHead>{t("messageColumn")}</TableHead>
              <TableHead>{t("timeColumn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>
                  <SeverityBadge severity={alert.severity} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {alert.alertCategory?.name ?? t("noCategoryLabel")}
                </TableCell>
                <TableCell className="font-mono">{alert.source}</TableCell>
                <TableCell className="max-w-md truncate font-mono">
                  {alert.message}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {formatTimestamp(alert.timestamp)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </PageBody>
  );
}
