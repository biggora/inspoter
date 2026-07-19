"use client";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { MailListItemDto } from "./api";

const SORT_ITEMS: Record<string, string> = {
  desc: "Сначала новые",
  asc: "Сначала старые",
};

// Deterministic avatar color from the sender string (prototype
// specs/prototype/src/pages/mail/page.tsx stringToColor). Lightness is
// dropped from the prototype's 0.55 to 0.5: greenish hues at 0.55 sit just
// under the 4.5:1 WCAG AA contrast ratio against the near-white initials
// (axe color-contrast, e2e/mail-client.spec.ts).
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.5 0.16 ${hue})`;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Relative list timestamp: today — HH:MM, otherwise a short RU date (with the
// year when it differs from the current one).
function formatListDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(
    "ru-RU",
    date.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
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
}: MessageListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-background-100 p-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Аккаунты и папки"
            onClick={onOpenSidebar}
            className="lg:hidden"
          >
            <Icon name="ri-menu-line" aria-hidden data-icon="inline-start" />
          </Button>
          <Input
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск по теме или отправителю..."
            aria-label="Поиск по почте"
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={unreadOnly}
            onPressedChange={onUnreadOnlyChange}
            variant="outline"
            size="sm"
            aria-label="Только непрочитанные"
            title="Только непрочитанные"
          >
            <Icon name="ri-mail-open-line" aria-hidden data-icon="inline-start" />
            Непрочитанные
          </Toggle>
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as "asc" | "desc")}
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="space-y-3 p-4">
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button type="button" size="sm" onClick={onRetry}>
              <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
              Повторить
            </Button>
          </div>
        ) : loading ? (
          <div>
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-b border-background-100 px-4 py-3"
              >
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full max-w-56" />
                </div>
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          hasActiveFilters ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                title="Ничего не найдено"
                description="Нет писем, соответствующих текущим фильтрам."
              />
            </div>
          ) : isWebhookAccount ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-mail-line"
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
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-mail-line"
                title="Нет писем"
                description="В этой папке пока пусто."
              />
            </div>
          )
        ) : (
          <ul aria-label="Список писем" className="flex flex-col">
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
                              aria-label="Есть вложения"
                              className="text-sm"
                            />
                          )}
                          <span className="whitespace-nowrap">
                            {formatListDate(item.receivedAt)}
                          </span>
                        </span>
                      </span>
                      <span
                        className={cn(
                          "truncate text-sm",
                          item.isRead
                            ? "text-foreground-500"
                            : "font-medium text-foreground-800",
                        )}
                      >
                        {item.subject}
                      </span>
                      {item.snippet && (
                        <span className="truncate text-xs text-foreground-400">
                          {item.snippet}
                        </span>
                      )}
                    </span>
                    {!item.isRead && (
                      <span
                        aria-label="Непрочитанное"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-500"
                      />
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
