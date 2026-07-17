"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
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
import { cn } from "@/lib/utils";
import { fetchLogs, type LogEntryDto } from "./api";

const LEVEL_ITEMS: Record<string, string> = {
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

// §2.5 severity scale (design.md) — unmapped level strings fall back to the
// muted tier rather than guessing; critical stays distinct from error.
const LEVEL_STYLES: Record<string, string> = {
  info: "border-(--info-border) bg-(--info-bg) text-(--info-text)",
  warning: "border-(--warning-border) bg-(--warning-bg) text-(--warning-text)",
  error: "border-(--error-border) bg-(--error-bg) text-(--error-text)",
  critical:
    "border-(--critical-border) bg-(--critical-bg) text-(--critical-text)",
};

function LevelBadge({ level }: { level: string }) {
  const normalized = level.toLowerCase();
  const style = LEVEL_STYLES[normalized] ?? "bg-muted text-muted-foreground";
  return <Badge className={cn("uppercase", style)}>{level}</Badge>;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

// Logs list (design.md §6.5, AC-LOG-001..004). Fetched client-side (per the
// task brief) since it's filterable/paginated. Pagination is keyset
// (cursor-based, architecture.md §2.4) — the API has no total count, so
// pages are tracked as a client-held stack of cursors rather than a
// "Page X of Y" total.
export function LogsView() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const [items, setItems] = useState<LogEntryDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [knownSources, setKnownSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the free-text search 300ms before it drives a fetch.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Any filter/sort/query change starts the list over at page 1. Reset
  // during render (React's "adjust state while rendering on prop change"
  // pattern, react.dev/reference/react/useState — same pattern as
  // bookmarks/bookmark-dialog.tsx) rather than in an effect, so the
  // dependent fetch effect below only ever sees the already-reset cursor.
  const filterKey = `${query}|${level}|${source}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  const currentCursor = pageCursors[pageIndex];

  // setLoading/setError/setItems only run inside the .then/.catch/.finally
  // continuations (not synchronously in the effect body) so this doesn't
  // trip react-hooks/set-state-in-effect — the initial `loading` state
  // already covers the pre-fetch value, and refetches update the table
  // in place without re-showing the skeleton.
  useEffect(() => {
    let cancelled = false;
    fetchLogs({
      cursor: currentCursor,
      level: level === "all" ? undefined : level,
      source: source === "all" ? undefined : source,
      query: query || undefined,
      sort,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setError(null);
        setKnownSources((prev) => {
          const set = new Set(prev);
          for (const item of result.items) set.add(item.source);
          return Array.from(set).sort();
        });
      })
      .catch(() => {
        if (!cancelled)
          setError("Не удалось загрузить логи. Попробуйте снова.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCursor, level, source, query, sort]);

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  const sourceItems: Record<string, string> = {
    all: "Все источники",
    ...Object.fromEntries(knownSources.map((value) => [value, value])),
  };

  const hasActiveFilters = query !== "" || level !== "all" || source !== "all";

  return (
    <PageBody>
      <PageHeader title="Логи">
        <FilterBar>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Поиск по сообщению..."
            aria-label="Поиск по сообщениям журнала"
            className="sm:max-w-xs"
          />
          <Select
            value={level}
            onValueChange={(v) => setLevel(v as string)}
            items={LEVEL_ITEMS}
          >
            <SelectTrigger size="sm" aria-label="Фильтр по уровню">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(LEVEL_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={source}
            onValueChange={(v) => setSource(v as string)}
            items={sourceItems}
          >
            <SelectTrigger size="sm" aria-label="Фильтр по источнику">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(sourceItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as "asc" | "desc")}
            items={SORT_ITEMS}
          >
            <SelectTrigger size="sm" aria-label="Порядок сортировки">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(SORT_ITEMS).map(([value, label]) => (
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
          <EmptyState description="Нет записей журнала, соответствующих текущим фильтрам." />
        ) : (
          <EmptyState
            icon={FileText}
            title="Логи пока отсутствуют"
            description="Отправьте первый лог через webhook:"
            action={
              <pre className="mt-2 w-full max-w-xl overflow-x-auto rounded-md bg-background-100 p-4 text-left text-xs">
                {`curl -X POST http://your-host/api/webhooks/log \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"level":"info","source":"test","message":"Hello"}'`}
              </pre>
            }
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Уровень</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Сообщение</TableHead>
              <TableHead>
                <span className="sr-only">Детали</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <Fragment key={entry.id}>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={entry.level} />
                    </TableCell>
                    <TableCell className="font-mono">{entry.source}</TableCell>
                    <TableCell className="max-w-md truncate font-mono">
                      {entry.message}
                    </TableCell>
                    <TableCell className="w-[var(--control-sm)]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={isExpanded}
                        aria-controls={`${entry.id}-detail`}
                        aria-label={`${isExpanded ? "Скрыть" : "Показать"} детали записи журнала`}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : entry.id)
                        }
                      >
                        <ChevronRight
                          aria-hidden
                          data-icon="inline-start"
                          className={cn(
                            "transition-transform",
                            isExpanded && "rotate-90",
                          )}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow id={`${entry.id}-detail`} className="bg-muted/30">
                      <TableCell
                        colSpan={5}
                        className="font-mono text-sm whitespace-pre-wrap"
                      >
                        {entry.message}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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
          <ChevronLeft aria-hidden data-icon="inline-start" />
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
          <ChevronRight aria-hidden data-icon="inline-end" />
        </Button>
      </div>
    </PageBody>
  );
}
