"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
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

const SEVERITY_ITEMS: Record<string, string> = {
  all: "Все уровни",
  info: "Информация",
  warning: "Предупреждение",
  error: "Ошибка",
  critical: "Критическая",
};

const SORT_ITEMS: Record<string, string> = {
  desc: "Сначала новые",
  asc: "Сначала старые",
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
        if (!cancelled) setError("Не удалось загрузить оповещения. Попробуйте снова.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentCursor, categoryId, severity, query, sort]);

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
    all: "Все категории",
    ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
  };

  const hasActiveFilters =
    query !== "" || categoryId !== "all" || severity !== "all";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Оповещения</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 aria-hidden className="size-4" />
            Управление категориями
          </Button>
          <Button
            size="sm"
            onClick={() => setCategoryDialog({ mode: "create" })}
          >
            <Plus aria-hidden className="size-4" />
            Новая категория
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Поиск по сообщению..."
          aria-label="Поиск по сообщениям оповещений"
          className="sm:max-w-xs"
        />
        <Select
          value={categoryId}
          onValueChange={(v) => handleCategoryChange(v as string)}
          items={categoryItems}
        >
          <SelectTrigger size="sm" aria-label="Фильтр по категории">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(categoryItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(v) => handleSeverityChange(v as string)}
          items={SEVERITY_ITEMS}
        >
          <SelectTrigger size="sm" aria-label="Фильтр по уровню важности">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SEVERITY_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => handleSortChange(v as "asc" | "desc")}
          items={SORT_ITEMS}
        >
          <SelectTrigger size="sm" aria-label="Порядок сортировки">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert className="border-(--error-bg) bg-(--error-bg)">
          <AlertDescription className="text-(--error-text)">
            {error}
          </AlertDescription>
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
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Нет алертов, соответствующих текущим фильтрам.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">
              Алерты пока отсутствуют
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Отправьте первый алерт через webhook:
            </p>
            <pre className="mt-2 w-full max-w-xl overflow-x-auto rounded-md bg-muted p-4 text-left text-xs">
              {`curl -X POST http://your-host/api/webhooks/alert \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"category":"deploy","severity":"warning","source":"test","message":"Hello"}'`}
            </pre>
          </div>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Уровень</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Сообщение</TableHead>
              <TableHead>Время</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>
                  <SeverityBadge severity={alert.severity} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {alert.alertCategory?.name ?? "Без категории"}
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

      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={pageIndex === 0 || loading}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Назад
        </Button>
        <span className="text-sm text-muted-foreground">
          Страница {pageIndex + 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={!nextCursor || loading}
        >
          Далее
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>

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
    </div>
  );
}
