import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  mockCategories,
  getChannelMessages,
  getChannelById,
  getCategoryByChannelId,
  teamMembers,
} from "@/mocks/messages";
import type { Category, Channel, Message } from "@/mocks/messages";

type PageState = "loading" | "error" | "ready";

interface NotificationState {
  message: string;
  variant: "success" | "error";
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
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
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shouldShowDateSeparator(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].timestamp).toDateString();
  const prev = new Date(messages[index - 1].timestamp).toDateString();
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

export default function MessagesPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load data
  const loadData = useCallback(() => {
    setPageState("loading");
    setTimeout(() => {
      const shouldFail = false;
      if (shouldFail) {
        setPageState("error");
      } else {
        setCategories(
          mockCategories.map((c) => ({
            ...c,
            channels: c.channels.map((ch) => ({ ...ch })),
          })),
        );
        setPageState("ready");
        // Auto-select first channel
        if (
          mockCategories.length > 0 &&
          mockCategories[0].channels.length > 0
        ) {
          setSelectedChannelId(mockCategories[0].channels[0].id);
        }
      }
    }, 700);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedChannelId]);

  // Toggle category collapse
  const toggleCategory = useCallback((catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  }, []);

  // Select channel and mark as read
  const selectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        channels: cat.channels.map((ch) =>
          ch.id === channelId ? { ...ch, unreadCount: 0 } : ch,
        ),
      })),
    );
  }, []);

  // Current data
  const selectedChannel = useMemo(
    () => (selectedChannelId ? getChannelById(selectedChannelId) : undefined),
    [selectedChannelId],
  );

  const selectedCategory = useMemo(
    () =>
      selectedChannelId ? getCategoryByChannelId(selectedChannelId) : undefined,
    [selectedChannelId],
  );

  const channelMessages = useMemo(
    () => (selectedChannelId ? getChannelMessages(selectedChannelId) : []),
    [selectedChannelId],
  );

  const totalUnread = useMemo(
    () =>
      categories.reduce(
        (sum, cat) =>
          sum + cat.channels.reduce((s, ch) => s + ch.unreadCount, 0),
        0,
      ),
    [categories],
  );

  // Handle message input
  const [messageInput, setMessageInput] = useState("");
  const handleSendMessage = useCallback(() => {
    const trimmed = messageInput.trim();
    if (!trimmed || !selectedChannelId) return;
    setNotification({
      message: "Демо-режим: сообщения только для чтения",
      variant: "error",
    });
    setMessageInput("");
  }, [messageInput, selectedChannelId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  // Loading skeletons
  if (pageState === "loading") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 border-r border-background-200 bg-background-50 flex flex-col">
          <div className="px-4 py-3 border-b border-background-100">
            <div className="animate-skeleton h-8 rounded-lg"></div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {[1, 2, 3].map((cat) => (
              <div key={cat} className="space-y-1">
                <div className="animate-skeleton h-3 w-20 rounded mb-2"></div>
                {[1, 2, 3].map((ch) => (
                  <div key={ch} className="flex items-center gap-2 px-2 py-1.5">
                    <div className="animate-skeleton w-4 h-4 rounded shrink-0"></div>
                    <div className="animate-skeleton h-3.5 flex-1 rounded"></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="px-3 py-3 border-t border-background-100">
            <div className="animate-skeleton h-9 rounded-lg"></div>
          </div>
        </div>
        {/* Main area skeleton */}
        <div className="flex-1 flex flex-col bg-background-50">
          <div className="px-5 py-3 border-b border-background-100 flex items-center gap-3">
            <div className="animate-skeleton w-5 h-5 rounded"></div>
            <div className="animate-skeleton h-5 w-36 rounded"></div>
          </div>
          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            {[1, 2, 3, 4, 5].map((m) => (
              <div key={m} className="flex gap-3 animate-fade-in">
                <div className="animate-skeleton w-9 h-9 rounded-full shrink-0"></div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex gap-2">
                    <div className="animate-skeleton h-3.5 w-24 rounded"></div>
                    <div className="animate-skeleton h-3 w-14 rounded"></div>
                  </div>
                  <div className="animate-skeleton h-3.5 w-full rounded"></div>
                  <div className="animate-skeleton h-3.5 w-3/4 rounded"></div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-background-100">
            <div className="animate-skeleton h-9 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-message-3-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Не удалось загрузить сообщения
          </h3>
          <p className="text-sm text-foreground-500 mb-6">
            Проверьте подключение к серверу сообщений и попробуйте снова.
          </p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // Ready state
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === "success"
              ? "bg-accent-100/80 text-accent-800"
              : "bg-primary-100/70 text-primary-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${
              notification.variant === "success"
                ? "ri-check-line"
                : "ri-error-warning-line"
            } w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      {/* ===== LEFT SIDEBAR — Categories & Channels ===== */}
      <div className="w-64 shrink-0 border-r border-background-200 bg-background-50 flex flex-col">
        {/* Channels header */}
        <div className="px-4 py-3 border-b border-background-100">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-foreground-900">
              Каналы
            </h3>
            {totalUnread > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-[10px] font-bold text-background-50">
                {totalUnread}
              </span>
            )}
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {categories.map((cat) => {
            const isCollapsed = collapsedCategories.has(cat.id);
            const hasUnread = cat.channels.some((ch) => ch.unreadCount > 0);

            return (
              <div key={cat.id}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer whitespace-nowrap group"
                >
                  <i
                    className={`ri-arrow-down-s-line w-3.5 h-3.5 flex items-center justify-center transition-transform ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  ></i>
                  <span className="uppercase tracking-wide text-[11px]">
                    {cat.name}
                  </span>
                  {isCollapsed && hasUnread && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                  )}
                </button>

                {/* Channels under category */}
                {!isCollapsed &&
                  cat.channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => selectChannel(ch.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer group ${
                        selectedChannelId === ch.id
                          ? "bg-primary-100/70 text-primary-700"
                          : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900"
                      }`}
                      title={ch.description}
                    >
                      <span className="text-base font-medium text-foreground-400 shrink-0">
                        #
                      </span>
                      <span className="truncate">{ch.name}</span>
                      {ch.unreadCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-[10px] font-bold text-background-50">
                          {ch.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>

        {/* User area */}
        <div className="px-3 py-3 border-t border-background-200 bg-background-100/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-accent-700">A</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground-900 truncate">
                admin
              </p>
              <p className="text-[11px] text-foreground-400 truncate">В сети</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MAIN AREA — Message Feed ===== */}
      <div className="flex-1 flex flex-col bg-background-50 min-w-0">
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <div className="px-5 py-3 border-b border-background-100 flex items-center gap-3 shrink-0">
              <span className="text-lg font-semibold text-foreground-400">
                #
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-sm font-semibold text-foreground-900 truncate">
                  {selectedChannel.name}
                </h3>
                {selectedChannel.description && (
                  <p className="text-[11px] text-foreground-400 truncate">
                    {selectedChannel.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedCategory && (
                  <span className="text-[10px] text-foreground-400 uppercase tracking-wide px-2 py-0.5 rounded-full bg-background-100">
                    {selectedCategory.name}
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {channelMessages.length === 0 ? (
                /* Empty messages in channel */
                <div className="flex items-center justify-center h-full">
                  <div className="text-center animate-scale-in">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary-100 flex items-center justify-center">
                      <i className="ri-message-2-line text-xl text-secondary-600"></i>
                    </div>
                    <h4 className="font-heading text-sm font-semibold text-foreground-900 mb-1">
                      Нет сообщений
                    </h4>
                    <p className="text-xs text-foreground-500">
                      В канале <strong>#{selectedChannel.name}</strong> пока нет
                      сообщений. Напишите первое!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {channelMessages.map((msg, idx) => {
                    const showDateSep = shouldShowDateSeparator(
                      channelMessages,
                      idx,
                    );
                    const initials = msg.authorInitials;
                    const memberColor =
                      teamMembers[initials]?.color || "oklch(0.55 0.12 100)";

                    return (
                      <div key={msg.id}>
                        {/* Date separator */}
                        {showDateSep && (
                          <div className="flex items-center gap-3 my-4 first:mt-0">
                            <div className="flex-1 h-px bg-background-200"></div>
                            <span className="text-[11px] font-medium text-foreground-400 uppercase whitespace-nowrap">
                              {formatDateSeparator(msg.timestamp)}
                            </span>
                            <div className="flex-1 h-px bg-background-200"></div>
                          </div>
                        )}

                        {/* Message */}
                        <div className="flex gap-3 px-2 py-1 -mx-2 rounded-md hover:bg-background-100/50 transition-colors group">
                          {/* Avatar */}
                          <div
                            className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-background-50 mt-0.5"
                            style={{ backgroundColor: memberColor }}
                          >
                            {msg.authorInitials}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground-900 whitespace-nowrap">
                                {msg.author}
                              </span>
                              <span
                                className="text-[11px] text-foreground-400 whitespace-nowrap"
                                title={formatMessageFull(msg.timestamp)}
                              >
                                {formatMessageTime(msg.timestamp)}
                              </span>
                            </div>
                            <div
                              className="text-sm text-foreground-800 leading-relaxed mt-0.5 whitespace-pre-wrap break-words"
                              dangerouslySetInnerHTML={{
                                __html: msg.content
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
                                  .replace(
                                    /\|(.+)\|/g,
                                    '<span class="text-accent-700">|$1|</span>',
                                  )
                                  .replace(
                                    /(https?:\/\/\S+)/g,
                                    '<a href="$1" class="text-accent-600 hover:text-accent-700 underline underline-offset-2 transition-colors" rel="nofollow">$1</a>',
                                  )
                                  .replace(
                                    /❌/g,
                                    '<span class="text-red-500">❌</span>',
                                  )
                                  .replace(
                                    /✅/g,
                                    '<span class="text-green-500">✅</span>',
                                  )
                                  .replace(
                                    /⚠️/g,
                                    '<span class="text-amber-500">⚠️</span>',
                                  )
                                  .replace(
                                    /🔴/g,
                                    '<span class="text-red-500">🔴</span>',
                                  )
                                  .replace(
                                    /🟢/g,
                                    '<span class="text-green-500">🟢</span>',
                                  )
                                  .replace(
                                    /🔍/g,
                                    '<span class="text-foreground-600">🔍</span>',
                                  )
                                  .replace(
                                    /🔐/g,
                                    '<span class="text-amber-600">🔐</span>',
                                  )
                                  .replace(
                                    /🔓/g,
                                    '<span class="text-red-500">🔓</span>',
                                  )
                                  .replace(
                                    /🛡/g,
                                    '<span class="text-accent-600">🛡</span>',
                                  )
                                  .replace(
                                    /📊/g,
                                    '<span class="text-foreground-600">📊</span>',
                                  )
                                  .replace(
                                    /📈/g,
                                    '<span class="text-green-500">📈</span>',
                                  )
                                  .replace(/\n/g, "<br/>"),
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message input */}
            <div className="px-5 py-3 border-t border-background-100 bg-background-50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Написать в #${selectedChannel.name}...`}
                    className="w-full pl-4 pr-12 py-2 rounded-lg border border-background-200 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-colors cursor-pointer"
                      title="Прикрепить файл"
                    >
                      <i className="ri-attachment-2 w-4 h-4 flex items-center justify-center"></i>
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                  title="Отправить"
                >
                  <i className="ri-send-plane-fill w-4 h-4 flex items-center justify-center"></i>
                </button>
              </div>
              <p className="text-[10px] text-foreground-400 mt-1.5 px-0.5">
                Демо-режим — сообщения только для чтения
              </p>
            </div>
          </>
        ) : (
          /* No channel selected */
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center animate-scale-in">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
                <i className="ri-message-2-line text-2xl text-secondary-500"></i>
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground-900 mb-1">
                Выберите канал
              </h3>
              <p className="text-sm text-foreground-400">
                Выберите канал слева, чтобы начать общение
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
