"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { fetchLogs, type LogEntryDto } from "./api";

const LEVEL_ITEMS: Record<string, string> = {
  all: "All levels",
  info: "Info",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
};

const SORT_ITEMS: Record<string, string> = {
  desc: "Newest first",
  asc: "Oldest first",
};

// §2.5 severity scale (design.md) — unmapped level strings fall back to the
// muted tier rather than guessing.
const LEVEL_STYLES: Record<string, string> = {
  info: "bg-(--info-bg) text-(--info-text)",
  warning: "bg-(--warning-bg) text-(--warning-text)",
  error: "bg-(--error-bg) text-(--error-text)",
  critical: "bg-[#DC2626] text-white",
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
        if (!cancelled) setError("Couldn't load logs. Try again.");
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
    all: "All sources",
    ...Object.fromEntries(knownSources.map((value) => [value, value])),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Logs</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search message..."
          aria-label="Search log messages"
          className="sm:max-w-xs"
        />
        <Select
          value={level}
          onValueChange={(v) => setLevel(v as string)}
          items={LEVEL_ITEMS}
        >
          <SelectTrigger size="sm" aria-label="Filter by level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LEVEL_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={source}
          onValueChange={(v) => setSource(v as string)}
          items={sourceItems}
        >
          <SelectTrigger size="sm" aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sourceItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as "asc" | "desc")}
          items={SORT_ITEMS}
        >
          <SelectTrigger size="sm" aria-label="Sort order">
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
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No log entries match the current filters.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <Fragment key={entry.id}>
                  <TableRow
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-controls={`${entry.id}-detail`}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedId(isExpanded ? null : entry.id);
                      }
                    }}
                  >
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
                  </TableRow>
                  {isExpanded && (
                    <TableRow id={`${entry.id}-detail`} className="bg-muted/30">
                      <TableCell
                        colSpan={4}
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
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={!nextCursor || loading}
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}
