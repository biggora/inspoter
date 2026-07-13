"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Hash,
  Menu,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SidebarTreeProps {
  categories: MessageCategoryDto[];
  categoriesLoading: boolean;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onNewCategory: () => void;
  onEditCategory: (category: MessageCategoryDto) => void;
  onDeleteCategory: (category: MessageCategoryDto) => void;
  onNewChannel: (categoryId: string) => void;
  onEditChannel: (channel: ChannelDto) => void;
  onDeleteChannel: (channel: ChannelDto) => void;
}

// Category/channel tree shared by the persistent desktop rail (>= lg) and
// the off-canvas Sheet used on mobile (task brief: "left panel collapses —
// show a channel picker at top instead"), so CRUD stays reachable on both.
function SidebarTree({
  categories,
  categoriesLoading,
  selectedChannelId,
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
      <div className="flex-1 overflow-y-auto p-2">
        {categoriesLoading ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : categories.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No categories yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((category) => (
              <div key={category.id} className="group/category">
                <div className="flex items-center justify-between gap-1 px-2">
                  <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {category.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity group-hover/category:opacity-100 lg:opacity-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`New channel in ${category.name}`}
                      onClick={() => onNewChannel(category.id)}
                    >
                      <Plus aria-hidden className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => onEditCategory(category)}
                    >
                      <Pencil aria-hidden className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => onDeleteCategory(category)}
                    >
                      <Trash2 aria-hidden className="size-3" />
                    </Button>
                  </div>
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {category.channels.length === 0 ? (
                    <p className="px-3 py-1 text-xs text-muted-foreground">
                      No channels
                    </p>
                  ) : (
                    category.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="group/channel flex items-center justify-between gap-1 rounded-md"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectChannel(channel.id)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                            channel.id === selectedChannelId
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <Hash aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">{channel.name}</span>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity group-hover/channel:opacity-100 lg:opacity-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Rename ${channel.name}`}
                            onClick={() => onEditChannel(channel)}
                          >
                            <Pencil aria-hidden className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete ${channel.name}`}
                            onClick={() => onDeleteChannel(channel)}
                          >
                            <Trash2 aria-hidden className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onNewCategory}
        >
          <Plus aria-hidden className="size-4" />
          New category
        </Button>
      </div>
    </div>
  );
}

// Messages: Discord-style category/channel sidebar + selected-channel
// message list (design.md §6.4, AC-MSG-001..004, AC-MSG-007). No compose
// box — messages arrive only via webhook (OQ-2 MVP interpretation). Below
// `lg` (src/hooks/use-mobile.ts) the persistent rail collapses to a channel
// picker + a Sheet trigger that reuses the same SidebarTree.
export function MessagesView() {
  const isMobile = useIsMobile();
  const [categories, setCategories] = useState<MessageCategoryDto[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        setCategoriesError("Couldn't load categories. Try again.");
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
        if (!cancelled) setMessagesError("Couldn't load messages. Try again.");
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId, currentCursor]);

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

  const selectedChannel = categories
    .flatMap((c) => c.channels)
    .find((c) => c.id === selectedChannelId);

  const sidebarTreeProps: SidebarTreeProps = {
    categories,
    categoriesLoading,
    selectedChannelId,
    onSelectChannel: handleSelectChannel,
    onNewCategory: () => setCategoryDialog({ mode: "create" }),
    onEditCategory: (category) => setCategoryDialog({ mode: "edit", category }),
    onDeleteCategory: (category) => setDeleteCategoryTarget(category),
    onNewChannel: (categoryId) =>
      setChannelDialog({ mode: "create", categoryId }),
    onEditChannel: (channel) => setChannelDialog({ mode: "edit", channel }),
    onDeleteChannel: (channel) => setDeleteChannelTarget(channel),
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Messages</h1>

      {categoriesError && (
        <Alert className="border-(--error-bg) bg-(--error-bg)">
          <AlertDescription className="text-(--error-text)">
            {categoriesError}
          </AlertDescription>
        </Alert>
      )}

      {isMobile && (
        <div className="flex items-center gap-2">
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
            <SelectTrigger className="flex-1" aria-label="Select a channel">
              <SelectValue placeholder="Select a channel..." />
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
            aria-label="Manage categories and channels"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu aria-hidden className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* Left rail: categories + channels (persistent from lg upward) */}
        <div className="hidden w-56 shrink-0 border-r border-border lg:block">
          <SidebarTree {...sidebarTreeProps} />
        </div>

        {/* Main panel: selected channel messages */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selectedChannel ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {categories.length === 0
                  ? "Create a category and channel to get started."
                  : "Select a channel to view its messages."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
                <Hash aria-hidden className="size-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {selectedChannel.name}
                </span>
              </div>

              {messagesError && (
                <Alert className="m-4 border-(--error-bg) bg-(--error-bg)">
                  <AlertDescription className="text-(--error-text)">
                    {messagesError}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                {messagesLoading ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages in this channel yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className="flex items-baseline gap-3"
                      >
                        <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
                          {message.author ?? "unknown"}
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-foreground">
                          {message.content}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTimestamp(message.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-4 border-t border-border p-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={pageIndex === 0 || messagesLoading}
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
                  disabled={!nextCursor || messagesLoading}
                >
                  Next
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Categories &amp; channels</SheetTitle>
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
