"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { useRouter } from "@/i18n/navigation";

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
import { buildListSearch, listHref } from "@/lib/list-search-params";
import { cn } from "@/lib/utils";
import { fetchActivities, type ActivityDto } from "./api";
import { formatShortDateTime } from "@/lib/format/datetime";

const ACTION_LABEL_KEYS: Record<string, string> = {
  all: "allActions",
  create: "actionCreate",
  update: "actionUpdate",
  delete: "actionDelete",
  reorder: "actionReorder",
  move: "actionMove",
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
  kanban_board: "entityKanbanBoard",
  kanban_column: "entityKanbanColumn",
  kanban_card: "entityKanbanCard",
  kanban_label: "entityKanbanLabel",
  note: "entityNote",
  note_folder: "entityNoteFolder",
  service: "entityService",
  credential: "entityCredential",
  dns_record: "entityDnsRecord",
  server: "entityServer",
  hosting_account: "entityHostingAccount",
  mail_account: "entityMailAccount",
  mail_label: "entityMailLabel",
  mail_filter_rule: "entityMailFilterRule",
  mail_template: "entityMailTemplate",
  mail_template_tag: "entityMailTemplateTag",
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

// Activity log list (mirrors LogsView — see design.md §6.5 pattern). Rows are
// fetched client-side since it's filterable/paginated, but the filters and the
// page live in the URL, so a filtered view survives a reload and is shareable.
// Pagination is keyset (cursor-based) — the API has no total count, so the
// page is the stack of cursors walked to reach it rather than a "Page X of Y"
// total.
export function ActivityView() {
  const t = useTranslations("activity");
  const tUi = useTranslations("ui");
  const router = useRouter();
  const params = useSearchParams();

  const query = params.get("query")?.trim() ?? "";
  const action = params.get("action") ?? "all";
  const entityType = params.get("entityType") ?? "all";
  const operator = params.get("operator") ?? "all";
  const sort: "asc" | "desc" = params.get("sort") === "asc" ? "asc" : "desc";
  const cursors = params.getAll("cursor");

  // Changing any filter drops the cursor stack — the same "a filter change
  // returns to the first page" rule the other paged lists use.
  function href(patch: {
    query?: string;
    action?: string;
    entityType?: string;
    operator?: string;
    sort?: "asc" | "desc";
    cursors?: string[];
  }): string {
    const next = { query, action, entityType, operator, sort, ...patch };
    const nextCursors =
      patch.cursors ?? (Object.keys(patch).length > 0 ? [] : cursors);
    return listHref(
      "/activity",
      buildListSearch({
        query: next.query,
        action: next.action === "all" ? null : next.action,
        entityType: next.entityType === "all" ? null : next.entityType,
        operator: next.operator === "all" ? null : next.operator,
        sort: next.sort === "desc" ? null : next.sort,
        cursor: nextCursors,
      }),
    );
  }

  // Local only as the debounce buffer; a change that came from elsewhere (the
  // back button, a shared link) has to win over whatever is in the box.
  const [searchInput, setSearchInput] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setSearchInput(query);
  }

  const [items, setItems] = useState<ActivityDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [knownOperators, setKnownOperators] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the free-text search 300ms before it drives a navigation.
  useEffect(() => {
    if (searchInput.trim() === query) return;
    const handle = setTimeout(
      () => router.push(href({ query: searchInput.trim() })),
      300,
    );
    return () => clearTimeout(handle);
    // The href builder closes over the filters, which only change with the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filterKey = `${query}|${action}|${entityType}|${operator}|${sort}`;
  const currentCursor = cursors[cursors.length - 1];

  // Which request the table on screen belongs to. Comparing it with the one
  // the effect below is about to run identifies a refetch (page turn, filter
  // change) without a second piece of state set inside the effect — the rows
  // stay put and `LoadingOverlay` reports the work.
  const requestKey = `${currentCursor ?? ""}|${filterKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const refreshing = !loading && loadedKey !== requestKey;

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
        if (cancelled) return;
        setLoading(false);
        setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCursor, action, entityType, operator, query, sort, requestKey, t]);

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
    query !== "" ||
    action !== "all" ||
    entityType !== "all" ||
    operator !== "all";

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
            onValueChange={(v) => router.push(href({ action: v as string }))}
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
            onValueChange={(v) =>
              router.push(href({ entityType: v as string }))
            }
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
            onValueChange={(v) => router.push(href({ operator: v as string }))}
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
            onValueChange={(v) =>
              router.push(href({ sort: v as "asc" | "desc" }))
            }
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
        <LoadingRegion>
          <TableSkeleton rows={4} />
        </LoadingRegion>
      ) : items.length === 0 ? (
        hasActiveFilters ? (
          // design.md §4.1: keep the filters mounted and offer the one-click
          // way back to the unfiltered feed.
          <EmptyState
            description={t("emptyFilteredDescription")}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput("");
                  router.push(
                    href({
                      query: "",
                      action: "all",
                      entityType: "all",
                      operator: "all",
                    }),
                  );
                }}
              >
                <Icon
                  name="ri-filter-off-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {tUi("clearFilters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="ri-history-line"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        )
      ) : (
        <LoadingOverlay busy={refreshing}>
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
                        {formatShortDateTime(entry.timestamp)}
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
                      <TableRow
                        id={`${entry.id}-detail`}
                        className="bg-muted/30"
                      >
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
        </LoadingOverlay>
      )}

      <Pagination
        page={cursors.length + 1}
        previous={
          cursors.length > 0
            ? { href: href({ cursors: cursors.slice(0, -1) }) }
            : null
        }
        next={
          nextCursor
            ? { href: href({ cursors: [...cursors, nextCursor] }) }
            : null
        }
        disabled={loading || refreshing}
      />
    </PageBody>
  );
}
