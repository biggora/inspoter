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
import { fetchActivities, type ActivityDto } from "./api";

const ACTION_LABEL_KEYS: Record<string, string> = {
  all: "allActions",
  create: "actionCreate",
  update: "actionUpdate",
  delete: "actionDelete",
  reorder: "actionReorder",
  check: "actionCheck",
  export: "actionExport",
  import: "actionImport",
  send: "actionSend",
  sync: "actionSync",
  revoke: "actionRevoke",
  rotate: "actionRotate",
};

const ENTITY_TYPE_LABEL_KEYS: Record<string, string> = {
  all: "allEntityTypes",
  bookmark: "entityBookmark",
  category: "entityCategory",
  service: "entityService",
  credential: "entityCredential",
  dns_record: "entityDnsRecord",
  server: "entityServer",
  hosting_account: "entityHostingAccount",
  mail_account: "entityMailAccount",
  mail_label: "entityMailLabel",
  mail_filter_rule: "entityMailFilterRule",
  mail: "entityMail",
  message_category: "entityMessageCategory",
  channel: "entityChannel",
  alert_category: "entityAlertCategory",
  webhook_token: "entityWebhookToken",
  channel_webhook: "entityChannelWebhook",
  outgoing_webhook: "entityOutgoingWebhook",
  workspace: "entityWorkspace",
  workspace_member: "entityWorkspaceMember",
  server_agent_token: "entityServerAgentToken",
  backup: "entityBackup",
};

const SORT_LABEL_KEYS: Record<string, string> = {
  desc: "sortDesc",
  asc: "sortAsc",
};

const ACTION_STYLES: Record<string, string> = {
  create: "border-(--info-border) bg-(--info-bg) text-(--info-text)",
  send: "border-(--info-border) bg-(--info-bg) text-(--info-text)",
  update: "bg-muted text-muted-foreground",
  reorder: "bg-muted text-muted-foreground",
  check: "bg-muted text-muted-foreground",
  sync: "bg-muted text-muted-foreground",
  delete: "border-(--error-border) bg-(--error-bg) text-(--error-text)",
  revoke: "border-(--error-border) bg-(--error-bg) text-(--error-text)",
  export: "border-(--warning-border) bg-(--warning-bg) text-(--warning-text)",
  import: "border-(--warning-border) bg-(--warning-bg) text-(--warning-text)",
  rotate: "border-(--warning-border) bg-(--warning-bg) text-(--warning-text)",
};

function ActionBadge({ action }: { action: string }) {
  const t = useTranslations("activity");
  const style = ACTION_STYLES[action] ?? "bg-muted text-muted-foreground";
  const labelKey = ACTION_LABEL_KEYS[action];
  const label = labelKey ? t(labelKey) : action;
  return <Badge className={style}>{label}</Badge>;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}.${mo} ${hh}:${mm}:${ss}`;
}

// Activity log list (mirrors LogsView — see design.md §6.5 pattern). Fetched
// client-side since it's filterable/paginated. Pagination is keyset
// (cursor-based) — the API has no total count, so pages are tracked as a
// client-held stack of cursors rather than a "Page X of Y" total.
export function ActivityView() {
  const t = useTranslations("activity");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [operator, setOperator] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const [items, setItems] = useState<ActivityDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [knownOperators, setKnownOperators] = useState<
    Array<{ id: string; name: string }>
  >([]);
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
  const filterKey = `${query}|${action}|${entityType}|${operator}|${sort}`;
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
    fetchActivities({
      cursor: currentCursor,
      action: action === "all" ? undefined : action,
      entityType: entityType === "all" ? undefined : entityType,
      operatorId: operator === "all" ? undefined : operator,
      query: query || undefined,
      sort,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setError(null);
        setKnownOperators((prev) => {
          const map = new Map(prev.map((o) => [o.id, o.name]));
          for (const item of result.items) {
            if (!map.has(item.operatorId)) {
              map.set(item.operatorId, item.operatorName);
            }
          }
          if (map.size === prev.length) return prev;
          return Array.from(map, ([id, name]) => ({ id, name }));
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
  }, [currentCursor, action, entityType, operator, query, sort, t]);

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  const actionItems: Record<string, string> = Object.fromEntries(
    Object.entries(ACTION_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const entityTypeItems: Record<string, string> = Object.fromEntries(
    Object.entries(ENTITY_TYPE_LABEL_KEYS).map(([value, key]) => [
      value,
      t(key),
    ]),
  );

  const sortItems: Record<string, string> = Object.fromEntries(
    Object.entries(SORT_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  );

  const operatorItems: Record<string, string> = {
    all: t("allOperators"),
    ...Object.fromEntries(knownOperators.map((o) => [o.id, o.name])),
  };

  const hasActiveFilters =
    query !== "" || action !== "all" || entityType !== "all" || operator !== "all";

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
            value={action}
            onValueChange={(v) => setAction(v as string)}
            items={actionItems}
          >
            <SelectTrigger size="sm" aria-label={t("actionFilterAriaLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(actionItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={entityType}
            onValueChange={(v) => setEntityType(v as string)}
            items={entityTypeItems}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("entityTypeFilterAriaLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(entityTypeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={operator}
            onValueChange={(v) => setOperator(v as string)}
            items={operatorItems}
          >
            <SelectTrigger size="sm" aria-label={t("operatorFilterAriaLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(operatorItems).map(([value, label]) => (
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
            icon="ri-history-line"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("timeHeader")}</TableHead>
              <TableHead>{t("operatorHeader")}</TableHead>
              <TableHead>{t("actionHeader")}</TableHead>
              <TableHead>{t("entityTypeHeader")}</TableHead>
              <TableHead>{t("entityHeader")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("detailsHeader")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const entityTypeLabelKey =
                ENTITY_TYPE_LABEL_KEYS[entry.entityType];
              const entityTypeLabel = entityTypeLabelKey
                ? t(entityTypeLabelKey)
                : entry.entityType;
              return (
                <Fragment key={entry.id}>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>{entry.operatorName}</TableCell>
                    <TableCell>
                      <ActionBadge action={entry.action} />
                    </TableCell>
                    <TableCell>{entityTypeLabel}</TableCell>
                    <TableCell
                      className={cn(
                        !entry.entityLabel && entry.entityId && "font-mono",
                      )}
                    >
                      {entry.entityLabel ?? entry.entityId ?? "—"}
                    </TableCell>
                    <TableCell className="w-[var(--control-sm)]">
                      {entry.details && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={isExpanded}
                          aria-controls={`${entry.id}-detail`}
                          aria-label={t("detailsHeader")}
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
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && entry.details && (
                    <TableRow id={`${entry.id}-detail`} className="bg-muted/30">
                      <TableCell
                        colSpan={6}
                        className="font-mono text-sm whitespace-pre-wrap"
                      >
                        {entry.details}
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
