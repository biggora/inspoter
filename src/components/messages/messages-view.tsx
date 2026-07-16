"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/components/messages/api";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  fetchMessages,
  messageCategoriesApi,
  type ChannelDto,
  type MessageCategoryDto,
  type MessageDto,
} from "./api";
import { CategoryDialog, type CategoryDialogState } from "./category-dialog";
import { ChannelDialog, type ChannelDialogState } from "./channel-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { DeleteChannelDialog } from "./delete-channel-dialog";

interface NotificationState {
  message: string;
  variant: "success" | "error";
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatMessageFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shouldShowDateSeparator(items: MessageDto[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(items[index].createdAt).toDateString();
  const prev = new Date(items[index - 1].createdAt).toDateString();
  return curr !== prev;
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getAuthorInitials(author: string | null): string {
  const name = author?.trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Fixed hue ramp around the color wheel, evenly spaced so avatars stay
// visually distinct without needing a server-provided per-user color.
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

function getAuthorColor(author: string | null): string {
  const name = author?.trim() || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AUTHOR_COLOR_PALETTE[hash % AUTHOR_COLOR_PALETTE.length];
}

// Lightweight rich-text rendering for webhook-authored messages — bold,
// inline code, headings, table rows, links, line breaks and a handful of
// status emoji get a bit of color. Content originates from our own webhook
// ingestion (not arbitrary third-party HTML), matching the accepted
// prototype behavior. Raw content is HTML-escaped first so any literal
// markup or script tags in a message can never execute — only the trusted
// markup introduced by the replacements below is rendered as HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMessageHtml(content: string): string {
  return escapeHtml(content)
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-semibold text-foreground-950">$1</strong>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-background-100 text-[13px] text-primary-700 font-mono">$1</code>',
    )
    .replace(
      /## (.+)/g,
      '<span class="text-base font-heading font-semibold text-foreground-950 block mt-1 mb-0.5">$1</span>',
    )
    .replace(
      /### (.+)/g,
      '<span class="text-sm font-heading font-semibold text-foreground-900 block mt-1 mb-0.5">$1</span>',
    )
    .replace(/\|(.+)\|/g, '<span class="text-accent-700">|$1|</span>')
    .replace(
      /(https?:\/\/\S+)/g,
      '<a href="$1" class="text-accent-600 hover:text-accent-700 underline underline-offset-2 transition-colors" rel="nofollow noopener noreferrer" target="_blank">$1</a>',
    )
    .replace(/❌/g, '<span class="text-red-500">❌</span>')
    .replace(/✅/g, '<span class="text-green-500">✅</span>')
    .replace(/⚠️/g, '<span class="text-amber-500">⚠️</span>')
    .replace(/🔴/g, '<span class="text-red-500">🔴</span>')
    .replace(/🟢/g, '<span class="text-green-500">🟢</span>')
    .replace(/🔍/g, '<span class="text-foreground-600">🔍</span>')
    .replace(/🔐/g, '<span class="text-amber-600">🔐</span>')
    .replace(/🔓/g, '<span class="text-red-500">🔓</span>')
    .replace(/🛡/g, '<span class="text-accent-600">🛡</span>')
    .replace(/📊/g, '<span class="text-foreground-600">📊</span>')
    .replace(/📈/g, '<span class="text-green-500">📈</span>')
    .replace(/\n/g, "<br/>");
}

interface SidebarTreeProps {
  categories: MessageCategoryDto[];
  selectedChannelId: string | null;
  collapsedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onNewCategory: () => void;
  onEditCategory: (category: MessageCategoryDto) => void;
  onDeleteCategory: (category: MessageCategoryDto) => void;
  onNewChannel: (categoryId: string) => void;
  onEditChannel: (channel: ChannelDto) => void;
  onDeleteChannel: (channel: ChannelDto) => void;
}

// Category/channel tree shared by the persistent desktop rail (>= lg) and
// the off-canvas Sheet used on mobile, so CRUD stays reachable on both.
function SidebarTree({
  categories,
  selectedChannelId,
  collapsedCategories,
  onToggleCategory,
  onSelectChannel,
  onNewCategory,
  onEditCategory,
  onDeleteCategory,
  onNewChannel,
  onEditChannel,
  onDeleteChannel,
}: SidebarTreeProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-background-100 px-4 py-3">
        <h3 className="font-heading text-sm font-semibold text-foreground-900">
          Каналы
        </h3>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {categories.length === 0 ? (
          <EmptyState
            size="xs"
            align="start"
            bordered={false}
            description="Категорий пока нет."
            className="px-2 py-4"
          />
        ) : (
          categories.map((category) => {
            const isCollapsed = collapsedCategories.has(category.id);
            return (
              <div key={category.id} className="group/category">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleCategory(category.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
                  >
                    <i
                      className={cn(
                        "ri-arrow-down-s-line flex h-3.5 w-3.5 shrink-0 items-center justify-center text-foreground-400 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[11px] font-semibold tracking-wide text-foreground-500 uppercase">
                      {category.name}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity group-hover/category:opacity-100 lg:opacity-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Новый канал в «${category.name}»`}
                      onClick={() => onNewChannel(category.id)}
                    >
                      <i className="ri-add-line text-xs" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Переименовать «${category.name}»`}
                      onClick={() => onEditCategory(category)}
                    >
                      <i className="ri-pencil-line text-xs" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Удалить «${category.name}»`}
                      onClick={() => onDeleteCategory(category)}
                    >
                      <i className="ri-delete-bin-line text-xs" aria-hidden />
                    </Button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="flex flex-col gap-0.5">
                    {category.channels.length === 0 ? (
                      <EmptyState
                        size="xs"
                        align="start"
                        bordered={false}
                        description="Нет каналов"
                        className="px-3 py-1"
                      />
                    ) : (
                      category.channels.map((channel) => (
                        <div
                          key={channel.id}
                          className="group/channel flex items-center gap-1 rounded-md"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectChannel(channel.id)}
                            title={channel.name}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                              channel.id === selectedChannelId
                                ? "bg-primary-100/70 text-primary-700"
                                : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900",
                            )}
                          >
                            <span className="shrink-0 text-base font-medium text-foreground-400">
                              #
                            </span>
                            <span className="truncate">{channel.name}</span>
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity group-hover/channel:opacity-100 lg:opacity-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Переименовать «${channel.name}»`}
                              onClick={() => onEditChannel(channel)}
                            >
                              <i
                                className="ri-pencil-line text-xs"
                                aria-hidden
                              />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Удалить «${channel.name}»`}
                              onClick={() => onDeleteChannel(channel)}
                            >
                              <i
                                className="ri-delete-bin-line text-xs"
                                aria-hidden
                              />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-background-100 p-2">
        <button
          type="button"
          onClick={onNewCategory}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
        >
          <i
            className="ri-add-line flex h-4 w-4 items-center justify-center"
            aria-hidden
          />
          Новая категория
        </button>
      </div>

      <div className="border-t border-background-200 bg-background-100/50 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100">
            <span className="text-xs font-semibold text-accent-700">A</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground-900">
              admin
            </p>
            <p className="truncate text-[11px] text-foreground-400">В сети</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Messages: Discord-style category/channel sidebar + selected-channel
// message feed (design.md §6.4, AC-MSG-001..004, AC-MSG-007). No compose
// box actually sends anything — messages arrive only via webhook (OQ-2 MVP
// interpretation); the input is a demo-mode affordance that surfaces a
// toast on submit. Below `lg` (src/hooks/use-mobile.ts) the persistent rail
// collapses to a channel picker + a Sheet trigger that reuses the same
// SidebarTree.
export function MessagesView() {
  const isMobile = useIsMobile();
  const [categories, setCategories] = useState<MessageCategoryDto[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );
  const [messageInput, setMessageInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [categoryDialog, setCategoryDialog] =
    useState<CategoryDialogState | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] =
    useState<MessageCategoryDto | null>(null);
  const [channelDialog, setChannelDialog] = useState<ChannelDialogState | null>(
    null,
  );
  const [deleteChannelTarget, setDeleteChannelTarget] =
    useState<ChannelDto | null>(null);

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesReloadToken, setMessagesReloadToken] = useState(0);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 3500);
    return () => clearTimeout(timer);
  }, [notification]);

  // Data fetch runs from a locally-defined async function rather than
  // directly in the effect body, so the loading/error resets aren't flagged
  // as a synchronous setState-in-effect (react-hooks/set-state-in-effect) —
  // matches src/components/mail/mail-view.tsx and
  // src/components/domains/dns-records-view.tsx.
  function loadCategories() {
    return messageCategoriesApi
      .list()
      .then((data) => {
        setCategories(data);
        setCategoriesError(null);
        return data;
      })
      .catch(() => {
        setCategoriesError("Не удалось загрузить каналы. Попробуйте снова.");
        return [] as MessageCategoryDto[];
      })
      .finally(() => setCategoriesLoading(false));
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function resetToFirstPage() {
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  const currentCursor = pageCursors[pageIndex];

  useEffect(() => {
    if (!selectedChannelId) return;
    const channelId = selectedChannelId;
    let cancelled = false;
    async function run() {
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const result = await fetchMessages(channelId, {
          cursor: currentCursor,
          sort: "asc",
        });
        if (cancelled) return;
        setMessages(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (!cancelled) {
          setMessagesError("Не удалось загрузить сообщения. Попробуйте снова.");
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId, currentCursor, messagesReloadToken]);

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  // Selecting (or clearing) a channel always resets pagination, and clears
  // any stale message list when there's no longer a channel to show —
  // called directly from event handlers rather than a `[selectedChannelId]`
  // effect (react-hooks/set-state-in-effect).
  function selectChannel(channelId: string | null) {
    setSelectedChannelId(channelId);
    resetToFirstPage();
    if (!channelId) {
      setMessages([]);
      setNextCursor(null);
    }
  }

  function toggleCategory(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  async function handleCategorySaved() {
    setCategoryDialog(null);
    await loadCategories();
  }

  async function handleCategoryDeleted() {
    const deletedId = deleteCategoryTarget?.id;
    setDeleteCategoryTarget(null);
    const updated = await loadCategories();
    if (
      deletedId &&
      !updated.some((c) => c.channels.some((ch) => ch.id === selectedChannelId))
    ) {
      selectChannel(null);
    }
  }

  async function handleChannelSaved() {
    setChannelDialog(null);
    await loadCategories();
  }

  async function handleChannelDeleted() {
    const deletedId = deleteChannelTarget?.id;
    setDeleteChannelTarget(null);
    await loadCategories();
    if (deletedId && deletedId === selectedChannelId) {
      selectChannel(null);
    }
  }

  function handleSelectChannel(channelId: string) {
    selectChannel(channelId);
    setMobileNavOpen(false);
  }

  const router = useRouter();

  const handleSendMessage = useCallback(async () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !selectedChannelId) return;
    try {
      await sendMessage(selectedChannelId, trimmed);
      setMessageInput("");
      router.refresh();
    } catch (error) {
      setNotification({
        message:
          error instanceof Error
            ? error.message
            : "Не удалось отправить сообщение",
        variant: "error",
      });
    }
  }, [messageInput, selectedChannelId, router]);

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  const selectedChannel = categories
    .flatMap((c) => c.channels)
    .find((c) => c.id === selectedChannelId);

  const selectedCategory = categories.find((c) =>
    c.channels.some((ch) => ch.id === selectedChannelId),
  );

  const sidebarTreeProps: SidebarTreeProps = {
    categories,
    selectedChannelId,
    collapsedCategories,
    onToggleCategory: toggleCategory,
    onSelectChannel: handleSelectChannel,
    onNewCategory: () => setCategoryDialog({ mode: "create" }),
    onEditCategory: (category) => setCategoryDialog({ mode: "edit", category }),
    onDeleteCategory: (category) => setDeleteCategoryTarget(category),
    onNewChannel: (categoryId) =>
      setChannelDialog({ mode: "create", categoryId }),
    onEditChannel: (channel) => setChannelDialog({ mode: "edit", channel }),
    onDeleteChannel: (channel) => setDeleteChannelTarget(channel),
  };

  // Loading skeleton — sidebar rail + message feed placeholders.
  if (categoriesLoading) {
    return (
      <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="shrink-0 border-b border-background-200 px-6 py-4">
          <PageHeader title="Сообщения" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="hidden w-64 shrink-0 flex-col border-r border-background-200 bg-background-50 lg:flex">
            <div className="border-b border-background-100 px-4 py-3">
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
              {[1, 2, 3].map((cat) => (
                <div key={cat} className="space-y-1">
                  <Skeleton className="mb-2 h-3 w-20" />
                  {[1, 2, 3].map((ch) => (
                    <div
                      key={ch}
                      className="flex items-center gap-2 px-2 py-1.5"
                    >
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                      <Skeleton className="h-3.5 flex-1" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="border-t border-background-100 px-3 py-3">
              <Skeleton className="h-9 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-1 flex-col bg-background-50">
            <div className="flex items-center gap-3 border-b border-background-100 px-5 py-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {[1, 2, 3, 4, 5].map((m) => (
                <div key={m} className="flex gap-3">
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
            <div className="border-t border-background-100 px-5 py-3">
              <Skeleton className="h-9 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state — categories failed to load entirely.
  if (categoriesError) {
    return (
      <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="shrink-0 border-b border-background-200 px-6 py-4">
          <PageHeader title="Сообщения" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            bordered={false}
            tone="danger"
            icon="ri-message-3-line"
            title="Не удалось загрузить сообщения"
            description={categoriesError}
            className="max-w-sm animate-in fade-in-0 zoom-in-95 duration-200"
            action={
              <Button type="button" onClick={loadCategories}>
                <i className="ri-refresh-line text-sm" aria-hidden />
                Повторить
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="shrink-0 border-b border-background-200 px-6 py-4">
        <PageHeader title="Сообщения" />
      </div>

      {notification && (
        <div
          className={cn(
            "animate-in fade-in-0 slide-in-from-right-4 fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium duration-200",
            notification.variant === "success"
              ? "bg-accent-100/90 text-accent-800"
              : "bg-primary-100/90 text-primary-800",
          )}
          role="status"
          aria-live="polite"
        >
          <i
            className={cn(
              notification.variant === "success"
                ? "ri-check-line"
                : "ri-error-warning-line",
              "text-base",
            )}
            aria-hidden
          />
          {notification.message}
        </div>
      )}

      {isMobile && (
        <div className="flex shrink-0 items-center gap-2 border-b border-background-200 bg-background-50 px-4 py-2.5">
          <Select
            value={selectedChannelId ?? ""}
            onValueChange={(v) => v && handleSelectChannel(v as string)}
            items={Object.fromEntries(
              categories.flatMap((category) =>
                category.channels.map((channel) => [
                  channel.id,
                  `# ${channel.name}`,
                ]),
              ),
            )}
          >
            <SelectTrigger className="flex-1" aria-label="Выбрать канал">
              <SelectValue placeholder="Выберите канал..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectGroup key={category.id}>
                  <SelectLabel>{category.name}</SelectLabel>
                  {category.channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      # {channel.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Категории и каналы"
            onClick={() => setMobileNavOpen(true)}
          >
            <i className="ri-menu-line text-base" aria-hidden />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left rail: categories + channels (persistent from lg upward) */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-background-200 bg-background-50 lg:flex">
          <SidebarTree {...sidebarTreeProps} />
        </div>

        {/* Main panel: selected channel messages */}
        <div className="flex min-w-0 flex-1 flex-col bg-background-50">
          {!selectedChannel ? (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-message-2-line"
                title={
                  categories.length === 0
                    ? "Категорий пока нет"
                    : "Выберите канал"
                }
                description={
                  categories.length === 0
                    ? "Создайте категорию и канал, чтобы начать общение."
                    : "Выберите канал слева, чтобы начать общение"
                }
                className="max-w-xs animate-in fade-in-0 zoom-in-95 duration-200"
              />
            </div>
          ) : (
            <>
              {/* Channel header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-background-100 px-5 py-3">
                <span className="text-lg font-semibold text-foreground-400">
                  #
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-heading text-sm font-semibold text-foreground-900">
                    {selectedChannel.name}
                  </h3>
                </div>
                {selectedCategory && (
                  <span className="shrink-0 rounded-full bg-background-100 px-2 py-0.5 text-[10px] tracking-wide text-foreground-400 uppercase">
                    {selectedCategory.name}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {messagesError ? (
                  <div className="flex h-full items-center justify-center">
                    <EmptyState
                      bordered={false}
                      size="sm"
                      tone="danger"
                      icon="ri-message-3-line"
                      title="Не удалось загрузить сообщения"
                      description={messagesError}
                      className="max-w-sm animate-in fade-in-0 zoom-in-95 duration-200"
                      action={
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setMessagesReloadToken((n) => n + 1)}
                        >
                          <i className="ri-refresh-line text-sm" aria-hidden />
                          Повторить
                        </Button>
                      }
                    />
                  </div>
                ) : messagesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((m) => (
                      <div key={m} className="flex gap-3">
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
                      title="Нет сообщений"
                      description={
                        <>
                          В канале <strong>#{selectedChannel.name}</strong> пока
                          нет сообщений.
                        </>
                      }
                      className="animate-in fade-in-0 zoom-in-95 duration-200"
                    />
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {messages.map((message, idx) => {
                      const showDateSep = shouldShowDateSeparator(
                        messages,
                        idx,
                      );
                      const initials = getAuthorInitials(message.author);
                      const color = getAuthorColor(message.author);

                      return (
                        <div key={message.id}>
                          {showDateSep && (
                            <div className="my-4 flex items-center gap-3 first:mt-0">
                              <div className="h-px flex-1 bg-background-200" />
                              <span className="text-[11px] font-medium tracking-wide text-foreground-400 uppercase whitespace-nowrap">
                                {formatDateSeparator(message.createdAt)}
                              </span>
                              <div className="h-px flex-1 bg-background-200" />
                            </div>
                          )}

                          <div className="group -mx-2 flex gap-3 rounded-md px-2 py-1 transition-colors hover:bg-background-100/50">
                            <div
                              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-background-50"
                              style={{ backgroundColor: color }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-sm font-semibold text-foreground-900 whitespace-nowrap">
                                  {message.author ?? "Неизвестно"}
                                </span>
                                <span
                                  className="text-[11px] text-foreground-400 whitespace-nowrap"
                                  title={formatMessageFull(message.createdAt)}
                                >
                                  {formatMessageTime(message.createdAt)}
                                </span>
                              </div>
                              <div
                                className="mt-0.5 text-sm leading-relaxed text-foreground-800 break-words whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                  __html: renderMessageHtml(message.content),
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              <div className="flex shrink-0 items-center justify-center gap-3 border-t border-background-100 px-5 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={pageIndex === 0 || messagesLoading}
                >
                  <i className="ri-arrow-left-s-line text-sm" aria-hidden />
                  Назад
                </Button>
                <span className="text-xs text-foreground-400">
                  Страница {pageIndex + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleNext}
                  disabled={!nextCursor || messagesLoading}
                >
                  Далее
                  <i className="ri-arrow-right-s-line text-sm" aria-hidden />
                </Button>
              </div>

              {/* Message input */}
              <div className="shrink-0 border-t border-background-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder={`Написать в #${selectedChannel.name}...`}
                      className="w-full rounded-lg border border-background-200 bg-background-50 py-2 pr-12 pl-4 text-sm text-foreground-900 transition-colors placeholder:text-foreground-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-300 focus:outline-none"
                    />
                    <div className="absolute top-1/2 right-2 -translate-y-1/2">
                      <button
                        type="button"
                        title="Прикрепить файл"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-600"
                      >
                        <i className="ri-attachment-2 text-sm" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    title="Отправить"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary-500 text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <i className="ri-send-plane-fill text-sm" aria-hidden />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-background-100">
            <SheetTitle>Категории и каналы</SheetTitle>
          </SheetHeader>
          <SidebarTree {...sidebarTreeProps} />
        </SheetContent>
      </Sheet>

      <CategoryDialog
        state={categoryDialog}
        onOpenChange={(open) => !open && setCategoryDialog(null)}
        onSaved={handleCategorySaved}
      />
      <DeleteCategoryDialog
        category={deleteCategoryTarget}
        onOpenChange={(open) => !open && setDeleteCategoryTarget(null)}
        onDeleted={handleCategoryDeleted}
      />
      <ChannelDialog
        state={channelDialog}
        onOpenChange={(open) => !open && setChannelDialog(null)}
        onSaved={handleChannelSaved}
      />
      <DeleteChannelDialog
        channel={deleteChannelTarget}
        onOpenChange={(open) => !open && setDeleteChannelTarget(null)}
        onDeleted={handleChannelDeleted}
      />
    </div>
  );
}
