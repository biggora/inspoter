"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchMessages,
  messageCategoriesApi,
  sendMessage,
  type ChannelDto,
  type MessageCategoryDto,
  type MessageDto,
} from "./api";
import { CategoryDialog, type CategoryDialogState } from "./category-dialog";
import { ChannelDialog, type ChannelDialogState } from "./channel-dialog";
import { ChannelHeader } from "./channel-header";
import { ChannelSidebar, type ChannelSidebarProps } from "./channel-sidebar";
import { ChannelSettingsDialog } from "./channel-settings-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { DeleteChannelDialog } from "./delete-channel-dialog";
import { MessageComposer } from "./message-composer";
import { MessageTimeline } from "./message-timeline";

function allChannels(categories: MessageCategoryDto[]): ChannelDto[] {
  return categories.flatMap((category) => category.channels);
}

function restoreSettingsOpenerFocus(opener: HTMLElement | null) {
  requestAnimationFrame(() => {
    if (
      opener?.isConnected &&
      !opener.hidden &&
      !opener.closest("[hidden], [inert]") &&
      (typeof opener.checkVisibility !== "function" || opener.checkVisibility())
    ) {
      opener.focus();
    }
  });
}

export function MessagesView({ workspaceId }: { workspaceId: string }) {
  return <MessagesCoordinator key={workspaceId} />;
}

function MessagesCoordinator() {
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

  const [categoryDialog, setCategoryDialog] =
    useState<CategoryDialogState | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] =
    useState<MessageCategoryDto | null>(null);
  const [channelDialog, setChannelDialog] = useState<ChannelDialogState | null>(
    null,
  );
  const [deleteChannelTarget, setDeleteChannelTarget] =
    useState<ChannelDto | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<ChannelDto | null>(
    null,
  );
  const settingsOpenerRef = useRef<HTMLElement | null>(null);

  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesReloadToken, setMessagesReloadToken] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  function loadCategories() {
    return messageCategoriesApi
      .list()
      .then((data) => {
        const channels = allChannels(data);
        setCategories(data);
        setCategoriesError(null);
        setSelectedChannelId((current) =>
          current && channels.some((channel) => channel.id === current)
            ? current
            : (channels[0]?.id ?? null),
        );
        return data;
      })
      .catch(() => {
        setCategoriesError("Не удалось загрузить каналы. Попробуйте снова.");
        return [] as MessageCategoryDto[];
      })
      .finally(() => setCategoriesLoading(false));
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (!selectedChannelId) {
      return;
    }
    const channelId = selectedChannelId;
    let cancelled = false;

    async function loadLatest() {
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const result = await fetchMessages(channelId, { sort: "desc" });
        if (cancelled) return;
        setMessages([...result.items].reverse());
        setNextCursor(result.nextCursor);
        requestAnimationFrame(() => {
          if (timelineRef.current) {
            timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
          }
        });
      } catch {
        if (!cancelled) {
          setMessagesError("Не удалось загрузить сообщения. Попробуйте снова.");
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }

    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId, messagesReloadToken]);

  function toggleCategory(categoryId: string) {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function handleSelectChannel(channelId: string) {
    if (channelId !== selectedChannelId) {
      setMessages([]);
      setNextCursor(null);
      setMessagesError(null);
      setSelectedChannelId(channelId);
    }
    setMobileNavOpen(false);
  }

  function openChannelSettings(channel: ChannelDto, opener: HTMLElement) {
    settingsOpenerRef.current = opener;
    setSettingsChannel(channel);
  }

  async function handleLoadPrevious() {
    if (!selectedChannelId || !nextCursor || loadingPrevious) return;
    const container = timelineRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;
    setLoadingPrevious(true);
    try {
      const result = await fetchMessages(selectedChannelId, {
        cursor: nextCursor,
        sort: "desc",
      });
      const olderMessages = [...result.items].reverse();
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [
          ...olderMessages.filter((message) => !existingIds.has(message.id)),
          ...current,
        ];
      });
      setNextCursor(result.nextCursor);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop =
              previousTop + (container.scrollHeight - previousHeight);
          }
        });
      });
    } catch {
      toast.error("Не удалось загрузить предыдущие сообщения.");
    } finally {
      setLoadingPrevious(false);
    }
  }

  async function handleSend(content: string) {
    if (!selectedChannelId) return;
    const channelId = selectedChannelId;
    await sendMessage(channelId, content);
    try {
      const refreshed = await fetchMessages(channelId, { sort: "desc" });
      setMessages([...refreshed.items].reverse());
      setNextCursor(refreshed.nextCursor);
      requestAnimationFrame(() => {
        if (timelineRef.current) {
          timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
        }
      });
    } catch {
      toast.error(
        "Сообщение отправлено, но ленту не удалось обновить. Повторите загрузку.",
      );
    }
  }

  async function handleCategorySaved() {
    setCategoryDialog(null);
    await loadCategories();
  }

  async function handleCategoryDeleted() {
    setDeleteCategoryTarget(null);
    await loadCategories();
  }

  async function handleChannelSaved() {
    setChannelDialog(null);
    await loadCategories();
  }

  async function handleChannelDeleted() {
    setDeleteChannelTarget(null);
    await loadCategories();
  }

  const selectedChannel = allChannels(categories).find(
    (channel) => channel.id === selectedChannelId,
  );
  const selectedCategory = categories.find((category) =>
    category.channels.some((channel) => channel.id === selectedChannelId),
  );

  const sidebarProps: ChannelSidebarProps = {
    categories,
    selectedChannelId,
    collapsedCategories,
    onToggleCategory: toggleCategory,
    onSelectChannel: handleSelectChannel,
    onNewCategory: () => setCategoryDialog({ mode: "create" }),
    onEditCategory: (category) => setCategoryDialog({ mode: "edit", category }),
    onDeleteCategory: setDeleteCategoryTarget,
    onNewChannel: (categoryId) =>
      setChannelDialog({ mode: "create", categoryId }),
    onOpenChannelSettings: openChannelSettings,
    onEditChannel: (channel) => setChannelDialog({ mode: "edit", channel }),
    onDeleteChannel: setDeleteChannelTarget,
  };

  if (categoriesLoading) {
    return <MessagesLoading />;
  }

  if (categoriesError) {
    return (
      <PageBody fullBleed>
        <div className="shrink-0 border-b border-background-200 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <PageHeader title="Сообщения" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            bordered={false}
            tone="danger"
            icon="ri-error-warning-line"
            title="Не удалось загрузить сообщения"
            description={categoriesError}
            className="max-w-sm"
            action={
              <Button type="button" onClick={() => void loadCategories()}>
                <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
                Повторить
              </Button>
            }
          />
        </div>
      </PageBody>
    );
  }

  return (
    <PageBody fullBleed>
      <div className="shrink-0 border-b border-background-200 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
        <PageHeader title="Сообщения" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-64 shrink-0 flex-col border-r border-background-200 bg-background-50 lg:flex">
          <ChannelSidebar {...sidebarProps} />
        </div>

        <main className="flex min-w-0 flex-1 flex-col bg-background-50">
          {!selectedChannel ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                bordered={false}
                size="sm"
                icon="ri-message-2-line"
                title="Категорий пока нет"
                description="Создайте категорию и канал, чтобы начать общение."
                className="max-w-xs"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    className="lg:hidden"
                    onClick={() => setMobileNavOpen(true)}
                  >
                    Открыть каналы
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <ChannelHeader
                channel={selectedChannel}
                categoryName={selectedCategory?.name}
                onOpenNavigation={() => setMobileNavOpen(true)}
                onOpenSettings={(opener) =>
                  openChannelSettings(selectedChannel, opener)
                }
              />
              <MessageTimeline
                channelName={selectedChannel.name}
                messages={messages}
                loading={messagesLoading}
                loadingPrevious={loadingPrevious}
                error={messagesError}
                hasPrevious={Boolean(nextCursor)}
                scrollRef={timelineRef}
                onRetry={() => setMessagesReloadToken((current) => current + 1)}
                onLoadPrevious={() => void handleLoadPrevious()}
              />
              <MessageComposer
                key={selectedChannel.id}
                channelName={selectedChannel.name}
                onSend={handleSend}
              />
            </>
          )}
        </main>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 max-w-[calc(100vw-2rem)] p-0 text-[var(--text-primary)] duration-0 data-ending-style:opacity-100 data-starting-style:opacity-100"
        >
          <SheetHeader className="border-b border-background-100">
            <SheetTitle>Категории и каналы</SheetTitle>
          </SheetHeader>
          <ChannelSidebar {...sidebarProps} />
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
      {settingsChannel && (
        <ChannelSettingsDialog
          key={settingsChannel.id}
          channel={settingsChannel}
          onOpenChange={(open) => {
            if (!open) {
              const opener = settingsOpenerRef.current;
              settingsOpenerRef.current = null;
              setSettingsChannel(null);
              restoreSettingsOpenerFocus(opener);
            }
          }}
          onRename={(channel) => {
            settingsOpenerRef.current = null;
            setSettingsChannel(null);
            setChannelDialog({ mode: "edit", channel });
          }}
          onDelete={(channel) => {
            settingsOpenerRef.current = null;
            setSettingsChannel(null);
            setDeleteChannelTarget(channel);
          }}
        />
      )}
    </PageBody>
  );
}

function MessagesLoading() {
  return (
    <PageBody fullBleed>
      <div className="shrink-0 border-b border-background-200 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
        <PageHeader title="Сообщения" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-64 shrink-0 flex-col border-r border-background-200 bg-background-50 lg:flex">
          <div className="space-y-4 px-3 py-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col bg-background-50">
          <div className="border-b border-background-100 px-5 py-3">
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="flex-1 space-y-4 p-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageBody>
  );
}
