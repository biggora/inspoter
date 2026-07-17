"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMail, type MailItemDto } from "./api";

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
        if (!cancelled)
          setError("Не удалось загрузить почту. Попробуйте снова.");
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

  const hasActiveFilters = query !== "";

  const selected = items.find((item) => item.id === selectedId) ?? null;

  if (selected) {
    return (
      <PageBody>
        <PageHeader
          back={{ onClick: () => setSelectedId(null), label: "Назад к почте" }}
          title={selected.subject}
          description={
            <>
              От <span className="font-mono">{selected.sender}</span> ·{" "}
              {formatTimestamp(selected.receivedAt)}
            </>
          }
        />
        <div className="rounded-lg border border-border bg-card p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
            {selected.body}
          </pre>
        </div>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader title="Почта">
        <FilterBar>
          <Input
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Поиск по теме/отправителю..."
            aria-label="Поиск по почте"
            className="sm:max-w-xs"
          />
          <Select
            value={sort}
            onValueChange={(v) => handleSortChange(v as "asc" | "desc")}
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
          <EmptyState description="Нет писем, соответствующих текущим фильтрам." />
        ) : (
          <EmptyState
            icon={Mail}
            title="Входящая почта пока отсутствует"
            description="Отправьте первое письмо через webhook:"
            action={
              <pre className="mt-2 w-full max-w-xl overflow-x-auto rounded-md bg-background-100 p-4 text-left text-xs">
                {`curl -X POST http://your-host/api/webhooks/mail \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sender":"noreply@example.com","subject":"Test","body":"Hello"}'`}
              </pre>
            }
          />
        )
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedId(item.id)}
                className="h-auto w-full justify-between rounded-none px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-3">
                  <span className="w-48 shrink-0 truncate text-sm font-medium text-foreground">
                    {item.sender}
                  </span>
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    {item.subject}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTimestamp(item.receivedAt)}
                </span>
              </Button>
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
