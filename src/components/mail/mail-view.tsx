"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

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
import { fetchMail, type MailItemDto } from "./api";

const SORT_ITEMS: Record<string, string> = {
  desc: "Newest first",
  asc: "Oldest first",
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
  });
}

// Mail list + detail (design.md §6.3, AC-MAIL-001..005). Fetched client-side
// (filterable/paginated, same rationale as Logs/Alerts). Detail is an
// in-place toggle rather than a route — the full entry (including body) is
// already present on each list item (mail.ts service selects all columns),
// so no extra fetch is needed on row click.
export function MailView() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const [items, setItems] = useState<MailItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const currentCursor = pageCursors[pageIndex];

  // Data fetch runs from a locally-defined async function rather than
  // directly in the effect body, so the loading/error resets aren't flagged
  // as a synchronous setState-in-effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMail({
          cursor: currentCursor,
          query: query || undefined,
          sort,
        });
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (!cancelled) setError("Couldn't load mail. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentCursor, query, sort]);

  function resetToFirstPage() {
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
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

  const selected = items.find((item) => item.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="flex flex-col gap-6">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setSelectedId(null)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to Mail
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            {selected.subject}
          </h1>
          <p className="text-sm text-muted-foreground">
            From <span className="font-mono">{selected.sender}</span> ·{" "}
            {formatTimestamp(selected.receivedAt)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
            {selected.body}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Mail</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search subject/sender..."
          aria-label="Search mail"
          className="sm:max-w-xs"
        />
        <Select
          value={sort}
          onValueChange={(v) => handleSortChange(v as "asc" | "desc")}
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
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No mail matches the current filters.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <div className="flex min-w-0 flex-1 items-baseline gap-3">
                  <span className="w-48 shrink-0 truncate text-sm font-medium text-foreground">
                    {item.sender}
                  </span>
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    {item.subject}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTimestamp(item.receivedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
