"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Ref } from "react";

import { Pagination } from "@/components/shell/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingRegion } from "@/components/ui/loading";
import { ListSkeleton } from "@/components/ui/skeletons";
import { StatusDot } from "@/components/ui/status-indicator";
import { Toggle } from "@/components/ui/toggle";
import { getInitials, stringToColor } from "@/lib/mail/avatar";
import { cn } from "@/lib/utils";
import type { MailListItemDto } from "./api";
import { LabelChip } from "./label-chip";

const SORT_LABEL_KEYS: Record<"desc" | "asc", string> = {
  desc: "sortDesc",
  asc: "sortAsc",
};

type Format = ReturnType<typeof useFormatter>;

// Relative list timestamp: today — HH:MM, otherwise a short RU date (with the
// year when it differs from the current one).
function formatListDate(iso: string, format: Format): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return format.dateTime(date, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return format.dateTime(
    date,
    date.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}

function formatSnippet(snippet: string): string {
  return snippet
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1");
}

export interface MessageListProps {
  items: MailListItemDto[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (value: boolean) => void;
  sort: "asc" | "desc";
  onSortChange: (value: "asc" | "desc") => void;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  hasActiveFilters: boolean;
  isWebhookAccount: boolean;
  onOpenSidebar: () => void;
  sidebarTriggerRef?: Ref<HTMLButtonElement>;
}

// Middle column of the mail client: search/filter header, message rows in the
// prototype style (initials avatar, unread dot + bold, snippet), pagination
// footer. Rows carry no bodies — the reading pane fetches the detail.
export function MessageList({
  items,
  loading,
  error,
  onRetry,
  selectedMessageId,
  onSelectMessage,
  searchInput,
  onSearchChange,
  unreadOnly,
  onUnreadOnlyChange,
  sort,
  onSortChange,
  page,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  hasActiveFilters,
  isWebhookAccount,
  onOpenSidebar,
  sidebarTriggerRef,
}: MessageListProps) {
  const t = useTranslations("mail");
  const format = useFormatter();
  const sortItems: Record<string, string> = Object.fromEntries(
    Object.entries(SORT_LABEL_KEYS).map(([value, key]) => [value, t(key)]),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-background-100 p-3">
        <div className="flex items-center gap-2">
          <Button
            ref={sidebarTriggerRef}
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("accountsAndFoldersLabel")}
            onClick={onOpenSidebar}
            className="lg:hidden"
          >
            <Icon name="ri-menu-line" aria-hidden data-icon="inline-start" />
          </Button>
          <Input
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAriaLabel")}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={unreadOnly}
            onPressedChange={onUnreadOnlyChange}
            variant="outline"
            size="sm"
            aria-label={t("unreadOnlyAriaLabel")}
            title={t("unreadOnlyAriaLabel")}
          >
            <Icon
              name="ri-mail-open-line"
              aria-hidden
              data-icon="inline-start"
            />
            {t("unreadOnlyText")}
          </Toggle>
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as "asc" | "desc")}
            items={sortItems}
          >
            <SelectTrigger size="sm" aria-label={t("sortOrderAriaLabel")}>
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="space-y-3 p-4">
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button type="button" size="sm" onClick={onRetry}>
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("retryButton")}
            </Button>
          </div>
        ) : loading ? (
          <LoadingRegion>
            <ListSkeleton rows={6} avatar dividers trailing />
          </LoadingRegion>
        ) : items.length === 0 ? (
          hasActiveFilters ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                title={t("emptyFilteredTitle")}
                description={t("emptyFilteredDescription")}
              />
            </div>
          ) : isWebhookAccount ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-mail-line"
                title={t("webhookEmptyTitle")}
                description={t("webhookEmptyDescription")}
                action={
                  <pre
                    className="mt-2 w-full max-w-xl overflow-x-auto rounded-md bg-background-100 p-4 text-left text-xs"
                    tabIndex={0}
                    role="region"
                    aria-label={t("webhookExampleLabel")}
                  >
                    {`curl -X POST http://your-host/api/webhooks/mail \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sender":"noreply@example.com","subject":"Test","body":"Hello"}'`}
                  </pre>
                }
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-mail-line"
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            </div>
          )
        ) : (
          <ul aria-label={t("messageListAriaLabel")} className="flex flex-col">
            {items.map((item) => {
              const displayName = item.fromName || item.from;
              const isSelected = item.id === selectedMessageId;
              return (
                <li key={item.id} className="border-b border-background-100">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectMessage(item.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "h-auto w-full items-start justify-start gap-3 rounded-none px-4 py-3 text-left whitespace-normal",
                      isSelected && "bg-background-100",
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-background-50"
                      style={{ backgroundColor: stringToColor(displayName) }}
                    >
                      {getInitials(displayName)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "min-w-0 truncate text-sm",
                            item.isRead
                              ? "text-foreground-600"
                              : "font-semibold text-foreground-900",
                          )}
                        >
                          {displayName}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-foreground-400">
                          {item.hasAttachments && (
                            <Icon
                              name="ri-attachment-line"
                              aria-hidden={false}
                              role="img"
                              aria-label={t("hasAttachmentsAriaLabel")}
                              className="text-sm"
                            />
                          )}
                          <span className="whitespace-nowrap">
                            {formatListDate(item.receivedAt, format)}
                          </span>
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1">
                        <span
                          className={cn(
                            "min-w-0 truncate text-sm",
                            item.isRead
                              ? "text-foreground-500"
                              : "font-medium text-foreground-800",
                          )}
                        >
                          {item.subject || t("noSubjectLabel")}
                        </span>
                        {item.labels.length > 0 && (
                          <span className="sr-only">
                            {t("messageLabelsAriaLabel", {
                              labels: item.labels
                                .map((label) => label.name)
                                .join(", "),
                            })}
                          </span>
                        )}
                        {item.labels[0] && <LabelChip label={item.labels[0]} />}
                        {item.labels[1] && (
                          <LabelChip
                            label={item.labels[1]}
                            className="inline-flex max-lg:hidden"
                          />
                        )}
                        {item.labels.length > 1 && (
                          <span
                            className="shrink-0 text-xs text-muted-foreground lg:hidden"
                            aria-label={t("moreLabelsAriaLabel", {
                              count: item.labels.length - 1,
                            })}
                          >
                            +{item.labels.length - 1}
                          </span>
                        )}
                        {item.labels.length > 2 && (
                          <span
                            className="inline shrink-0 text-xs text-muted-foreground max-lg:hidden"
                            aria-label={t("moreLabelsAriaLabel", {
                              count: item.labels.length - 2,
                            })}
                          >
                            +{item.labels.length - 2}
                          </span>
                        )}
                      </span>
                      {item.snippet && (
                        <span className="truncate text-xs text-foreground-400">
                          {formatSnippet(item.snippet)}
                        </span>
                      )}
                    </span>
                    {!item.isRead && (
                      <span
                        role="img"
                        aria-label={t("unreadAriaLabel")}
                        className="mt-1.5 shrink-0 text-primary-500"
                      >
                        <StatusDot />
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pagination
        page={page}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={onPrevious}
        onNext={onNext}
        disabled={loading}
        className="shrink-0 border-t border-background-100 px-4 py-2"
      />
    </div>
  );
}
