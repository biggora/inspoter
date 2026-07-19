"use client";

import type { RefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime, type Format } from "@/lib/format/relative-time";
import type { MessageDto } from "./api";

const AUTHOR_COLOR_PALETTE = [
  "oklch(0.55 0.18 20)",
  "oklch(0.55 0.17 60)",
  "oklch(0.55 0.15 100)",
  "oklch(0.55 0.14 140)",
  "oklch(0.55 0.14 175)",
  "oklch(0.55 0.15 210)",
  "oklch(0.55 0.16 250)",
  "oklch(0.55 0.18 285)",
  "oklch(0.55 0.17 320)",
  "oklch(0.55 0.19 350)",
];

function formatMessageTime(
  iso: string,
  t: (key: string, params?: Record<string, number>) => string,
  format: Format,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatRelativeTime(date, t, format);
}

function formatMessageFull(iso: string, format: Format): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format.dateTime(date, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateSeparator(
  iso: string,
  t: (key: string) => string,
  format: Format,
): string {
  const date = new Date(iso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");
  return format.dateTime(date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getAuthorInitials(author: string | null): string {
  const name = author?.trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function getAuthorColor(author: string | null): string {
  const name = author?.trim() || "?";
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return AUTHOR_COLOR_PALETTE[hash % AUTHOR_COLOR_PALETTE.length];
}

function originLabel(
  origin: MessageDto["origin"] | undefined,
  t: (key: string) => string,
): string {
  if (origin === "OPERATOR") return t("originOperator");
  if (origin === "WEBHOOK") return t("originWebhook");
  return t("originUnknown");
}

function shouldShowDateSeparator(items: MessageDto[], index: number): boolean {
  if (index === 0) return true;
  return (
    new Date(items[index].createdAt).toDateString() !==
    new Date(items[index - 1].createdAt).toDateString()
  );
}

interface MessageTimelineProps {
  channelName: string;
  messages: MessageDto[];
  loading: boolean;
  loadingPrevious: boolean;
  error: string | null;
  hasPrevious: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onLoadPrevious: () => void;
}

export function MessageTimeline({
  channelName,
  messages,
  loading,
  loadingPrevious,
  error,
  hasPrevious,
  scrollRef,
  onRetry,
  onLoadPrevious,
}: MessageTimelineProps) {
  const t = useTranslations("messages");
  const format = useFormatter();
  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      aria-busy={loading || loadingPrevious}
      data-testid="message-timeline"
    >
      {error ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            bordered={false}
            size="sm"
            tone="danger"
            icon="ri-error-warning-line"
            title={t("loadErrorTitle")}
            description={error}
            className="max-w-sm animate-in fade-in-0 zoom-in-95 duration-200"
            action={
              <Button type="button" size="sm" onClick={onRetry}>
                <Icon
                  name="ri-refresh-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("retryButton")}
              </Button>
            }
          />
        </div>
      ) : loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="flex gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            bordered={false}
            size="sm"
            icon="ri-message-2-line"
            title={t("noMessagesTitle")}
            description={t.rich("noMessagesDescription", {
              channelName,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
            className="animate-in fade-in-0 zoom-in-95 duration-200"
          />
        </div>
      ) : (
        <div className="space-y-0.5">
          {hasPrevious && (
            <div className="flex justify-center pb-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingPrevious}
                onClick={onLoadPrevious}
              >
                {loadingPrevious
                  ? t("loadingPreviousButton")
                  : t("loadPreviousButton")}
              </Button>
            </div>
          )}
          {messages.map((message, index) => {
            const initials = getAuthorInitials(message.author);
            return (
              <div key={message.id}>
                {shouldShowDateSeparator(messages, index) && (
                  <div className="my-4 flex items-center gap-3 first:mt-0">
                    <div className="h-px flex-1 bg-background-200" />
                    <span className="text-[11px] font-medium tracking-wide text-foreground-400 uppercase whitespace-nowrap">
                      {formatDateSeparator(message.createdAt, t, format)}
                    </span>
                    <div className="h-px flex-1 bg-background-200" />
                  </div>
                )}
                <article className="group -mx-2 flex gap-3 rounded-md px-2 py-1 transition-colors hover:bg-background-100/50 focus-within:bg-background-100/50">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-background-50"
                    style={{ backgroundColor: getAuthorColor(message.author) }}
                    aria-hidden
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground-900">
                        {message.author ?? t("unknownAuthor")}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px]"
                      >
                        {originLabel(message.origin, t)}
                      </Badge>
                      <time
                        className="text-[11px] text-foreground-400 whitespace-nowrap"
                        dateTime={message.createdAt}
                        title={formatMessageFull(message.createdAt, format)}
                      >
                        {formatMessageTime(message.createdAt, t, format)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground-800">
                      {message.content}
                    </p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
