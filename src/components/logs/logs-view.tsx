"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { fetchLogs, type LogEntryDto } from "./api";

const LEVEL_LABEL_KEYS: Record<string, string> = {
  all: "levelAll",
  info: "levelInfo",
  warning: "levelWarning",
  error: "levelError",
  critical: "levelCritical",
};

const SORT_LABEL_KEYS: Record<string, string> = {
  desc: "sortDesc",
  asc: "sortAsc",
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
  const t = useTranslations("logs");
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
        if (!cancelled) setError(t("loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCursor, level, source, query, sort, t]);

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  const levelItems: Record<string, string> = Object.fromEntries(
    Object.entries(LEVEL_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const sortItems: Record<string, string> = Object.fromEntries(
    Object.entries(SORT_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const sourceItems: Record<string, string> = {
    all: t("sourceAllLabel"),
    ...Object.fromEntries(knownSources.map((value) => [value, value])),
  };

  const hasActiveFilters = query !== "" || level !== "all" || source !== "all";

  return (
    <PageBody>
      <PageHeader title={t("pageTitle")}>
        <FilterBar>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAriaLabel")}
            className="sm:max-w-xs"
          />
          <Select
            value={level}
            onValueChange={(v) => setLevel(v as string)}
            items={levelItems}
          >
            <SelectTrigger size="sm" aria-label={t("levelFilterAriaLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(levelItems).map(([value, label]) => (
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
            <SelectTrigger size="sm" aria-label={t("sourceFilterAriaLabel")}>
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
            items={sortItems}
          >
            <SelectTrigger size="sm" aria-label={t("sortAriaLabel")}>
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
          <EmptyState description={t("emptyFilteredDescription")} />
        ) : (
          <EmptyState
            icon="ri-file-text-line"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
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
              <TableHead>{t("timeHeader")}</TableHead>
              <TableHead>{t("levelHeader")}</TableHead>
              <TableHead>{t("sourceHeader")}</TableHead>
              <TableHead>{t("messageHeader")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("detailsSrOnly")}</span>
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
                        aria-label={t("toggleDetailsAriaLabel", {
                          action: isExpanded
                            ? t("hideAction")
                            : t("showAction"),
                        })}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : entry.id)
                        }
                      >
                        <Icon
                          name="ri-arrow-right-s-line"
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

      <Pagination
        page={pageIndex + 1}
        hasPrevious={pageIndex > 0}
        hasNext={Boolean(nextCursor)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        disabled={loading}
      />
    </PageBody>
  );
}
