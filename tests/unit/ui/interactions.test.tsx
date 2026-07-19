// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

import { renderWithIntl } from "../../test-utils";
import { BookmarkCard } from "@/components/bookmarks/bookmark-card";
import { ColorPicker } from "@/components/bookmarks/color-picker";
import { LogsView } from "@/components/logs/logs-view";
import { MessagesView } from "@/components/messages/messages-view";
import type { Bookmark } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  fetchLogs: vi.fn(),
  fetchMessages: vi.fn(),
  isMobile: vi.fn(),
  listCategories: vi.fn(),
  refresh: vi.fn(),
  sendMessage: vi.fn(),
  listChannelWebhooks: vi.fn(),
  createChannelWebhook: vi.fn(),
  revokeChannelWebhook: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: mocks.isMobile,
}));

vi.mock("@/components/logs/api", () => ({
  fetchLogs: mocks.fetchLogs,
}));

vi.mock("@/components/messages/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;
  }

  return {
    ApiError,
    fetchMessages: mocks.fetchMessages,
    sendMessage: mocks.sendMessage,
    messageCategoriesApi: {
      list: mocks.listCategories,
      create: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
    },
    channelsApi: {
      create: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
    },
    channelWebhooksApi: {
      list: mocks.listChannelWebhooks,
      create: mocks.createChannelWebhook,
      revoke: mocks.revokeChannelWebhook,
    },
  };
});

describe("standardized UI interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile.mockReturnValue(false);
    mocks.listChannelWebhooks.mockResolvedValue([]);
  });

  it("keeps ColorPicker controlled, arrow-navigable, and looping", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return <ColorPicker value={value} onChange={setValue} />;
    }

    render(<Harness />);
    expect(screen.getByRole("group", { name: "Цвет" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    const none = screen.getByRole("button", { name: "Без цвета" });
    const secondary = screen.getByRole("button", { name: "Оливковый" });

    await user.tab();
    expect(none).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(secondary).toHaveFocus();
    expect(secondary).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{ArrowRight}");
    expect(none).toHaveFocus();
    expect(none).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps dnd-kit activator focus after keyboard cancel and drop", async () => {
    const user = userEvent.setup();
    const bookmark = {
      id: "bookmark-1",
      workspaceId: "workspace-1",
      categoryId: "category-1",
      categoryWorkspaceId: "workspace-1",
      name: "Documentation",
      url: "https://example.com/docs",
      icon: null,
      color: null,
      description: "Reference",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Bookmark;

    render(
      <DndContext>
        <SortableContext items={[bookmark.id]}>
          <BookmarkCard
            bookmark={bookmark}
            dragDisabled={false}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </SortableContext>
      </DndContext>,
    );

    const handle = screen.getByRole("button", {
      name: "Изменить порядок: «Documentation»",
    });
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");

    handle.focus();
    await user.keyboard(" ");
    handle.blur();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(handle).toHaveFocus());

    await user.keyboard(" ");
    handle.blur();
    await user.keyboard(" ");
    await waitFor(() => expect(handle).toHaveFocus());

    const link = screen.getByRole("link", { name: /Documentation/ });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("expands log details only through the explicit action button", async () => {
    const user = userEvent.setup();
    mocks.fetchLogs.mockResolvedValue({
      items: [
        {
          id: "log-1",
          level: "info",
          source: "webhook",
          message: "Preserved log contents",
          timestamp: "2026-07-17T10:15:30.123Z",
        },
      ],
      nextCursor: null,
    });

    renderWithIntl(<LogsView />);
    const expand = await screen.findByRole("button", {
      name: "Показать детали записи журнала",
    });

    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("Preserved log contents")).toHaveLength(1);

    await user.click(expand);

    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Preserved log contents")).toHaveLength(2);
  });

  it("keeps Enter multiline, sends once on Ctrl+Enter, and refetches", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({ items: [], nextCursor: null });
    mocks.sendMessage.mockResolvedValue({ id: "message-1" });

    render(<MessagesView workspaceId="workspace-a" />);
    const composer = await screen.findByPlaceholderText(
      "Написать в #general...",
    );
    await user.type(composer, "Первая строка{Enter}Вторая строка");

    expect(composer).toHaveValue("Первая строка\nВторая строка");
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      expect(composer).toHaveValue("");
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      "channel-1",
      "Первая строка\nВторая строка",
    );
    expect(mocks.fetchMessages).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Прикрепить файл/)).not.toBeInTheDocument();
  });

  it("preserves a failed message draft and associates the error", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({ items: [], nextCursor: null });
    mocks.sendMessage.mockRejectedValue(new Error("Сервис недоступен"));

    render(<MessagesView workspaceId="workspace-a" />);
    const composer = await screen.findByRole("textbox", {
      name: "Сообщение в канале #general",
    });
    await user.type(composer, "Не потеряйте меня");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(composer).toHaveValue("Не потеряйте меня"));
    expect(screen.getByRole("alert")).toHaveTextContent("Сервис недоступен");
  });

  it("shows a new channel webhook URL only until settings close", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({ items: [], nextCursor: null });
    mocks.createChannelWebhook.mockResolvedValue({
      webhook: {
        id: "webhook-1",
        channelId: "channel-1",
        name: "CI pipeline",
        tokenPrefix: "tokenpre",
        createdAt: "2026-07-18T12:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
      url: "/api/webhooks/channels/webhook-1/one-time-secret",
    });

    render(<MessagesView workspaceId="workspace-a" />);
    const headerOpener = await screen.findByRole("button", {
      name: "Настройки канала «general»",
    });
    await user.click(headerOpener);
    const dialog = await screen.findByRole("dialog", {
      name: "Настройки канала #general",
    });
    await user.click(within(dialog).getByRole("tab", { name: "Вебхуки" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Название webhook" }),
      "CI pipeline",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Создать webhook" }),
    );

    const url = await within(dialog).findByRole("textbox", {
      name: "URL webhook",
    });
    expect(url).toHaveValue(
      "http://localhost:3000/api/webhooks/channels/webhook-1/one-time-secret",
    );
    expect(mocks.createChannelWebhook).toHaveBeenCalledWith(
      "channel-1",
      "CI pipeline",
    );

    await user.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    await waitFor(() =>
      expect(
        screen.queryByDisplayValue(/one-time-secret/),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(document.activeElement).toBe(headerOpener));
  });

  it("restores channel settings focus to the exact desktop row opener", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({ items: [], nextCursor: null });

    render(<MessagesView workspaceId="workspace-a" />);
    await screen.findByRole("heading", { name: "general" });
    const rowOpener = screen.getByRole("button", {
      name: "Действия канала «general»",
    });
    await user.click(rowOpener);
    await user.click(
      await screen.findByRole("menuitem", { name: "Настройки канала" }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Настройки канала #general",
    });
    await user.click(within(settings).getByRole("button", { name: "Закрыть" }));

    await waitFor(() => expect(document.activeElement).toBe(rowOpener));
  });

  it("restores channel settings focus to the exact mobile Sheet row opener", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({ items: [], nextCursor: null });

    render(<MessagesView workspaceId="workspace-a" />);
    await user.click(
      await screen.findByRole("button", { name: "Открыть каналы" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Категории и каналы",
    });
    const sheetOpener = within(sheet).getByRole("button", {
      name: "Действия канала «general»",
    });
    await user.click(sheetOpener);
    await user.click(
      await screen.findByRole("menuitem", { name: "Настройки канала" }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Настройки канала #general",
    });
    await user.click(within(settings).getByRole("button", { name: "Закрыть" }));

    await waitFor(() => expect(document.activeElement).toBe(sheetOpener));
  });

  it("remounts all Messages state when the workspace identity changes", async () => {
    const user = userEvent.setup();
    mocks.listCategories
      .mockResolvedValueOnce([
        {
          id: "category-a",
          name: "Команда A",
          channels: [
            {
              id: "channel-a",
              messageCategoryId: "category-a",
              name: "канал-a",
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "category-b",
          name: "Команда B",
          channels: [
            {
              id: "channel-b",
              messageCategoryId: "category-b",
              name: "канал-b",
            },
          ],
        },
      ]);
    mocks.fetchMessages.mockImplementation(async (channelId: string) => ({
      items:
        channelId === "channel-a"
          ? [
              {
                id: "message-a",
                channelId: "channel-a",
                content: "Сообщение A",
                author: "operator-a",
                origin: "OPERATOR",
                createdAt: "2026-07-18T12:00:00.000Z",
              },
            ]
          : [],
      nextCursor: channelId === "channel-a" ? "cursor-a" : null,
    }));
    mocks.createChannelWebhook.mockResolvedValue({
      webhook: {
        id: "webhook-a",
        channelId: "channel-a",
        name: "Интеграция A",
        tokenPrefix: "prefix-a",
        createdAt: "2026-07-18T12:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
      url: "/api/webhooks/channels/webhook-a/transient-value",
    });

    const view = render(<MessagesView workspaceId="workspace-a" />);
    const draft = await screen.findByRole("textbox", {
      name: "Сообщение в канале #канал-a",
    });
    await user.type(draft, "Черновик A");
    expect(await screen.findByText("Сообщение A")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Загрузить предыдущие" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Настройки канала «канал-a»" }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Настройки канала #канал-a",
    });
    await user.click(within(settings).getByRole("tab", { name: "Вебхуки" }));
    await user.type(
      within(settings).getByRole("textbox", { name: "Название webhook" }),
      "Интеграция A",
    );
    await user.click(
      within(settings).getByRole("button", { name: "Создать webhook" }),
    );
    expect(
      await within(settings).findByRole("textbox", { name: "URL webhook" }),
    ).toBeInTheDocument();

    view.rerender(<MessagesView workspaceId="workspace-b" />);

    const workspaceBDraft = await screen.findByRole("textbox", {
      name: "Сообщение в канале #канал-b",
    });
    expect(workspaceBDraft).toHaveValue("");
    expect(
      screen.queryByRole("heading", { name: "канал-a" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Сообщение A")).not.toBeInTheDocument();
    expect(screen.queryByText("Черновик A")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Загрузить предыдущие" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Настройки канала #канал-a" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue(/transient-value/),
    ).not.toBeInTheDocument();
    expect(mocks.fetchMessages).toHaveBeenLastCalledWith("channel-b", {
      sort: "desc",
    });
  });

  it("renders message origins as text and never interprets message HTML", async () => {
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages.mockResolvedValue({
      items: [
        {
          id: "message-1",
          channelId: "channel-1",
          content: '<img src=x onerror="alert(1)">',
          author: "CI",
          origin: "WEBHOOK",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
        {
          id: "message-2",
          channelId: "channel-1",
          content: "Ответ оператора",
          author: "operator",
          origin: "OPERATOR",
          createdAt: "2026-07-18T12:01:00.000Z",
        },
        {
          id: "message-3",
          channelId: "channel-1",
          content: "Историческое сообщение",
          author: null,
          origin: "LEGACY",
          createdAt: "2026-07-18T12:02:00.000Z",
        },
      ],
      nextCursor: null,
    });

    render(<MessagesView workspaceId="workspace-a" />);

    expect(await screen.findByText("Внешний источник")).toBeInTheDocument();
    expect(screen.getByText("Оператор")).toBeInTheDocument();
    expect(screen.getByText("Источник не определён")).toBeInTheDocument();
    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(document.querySelector("article img")).toBeNull();
  });

  it("prepends older messages without changing the visible scroll anchor", async () => {
    const user = userEvent.setup();
    let scrollHeight = 600;
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);
    mocks.fetchMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "message-new",
            channelId: "channel-1",
            content: "Новое сообщение",
            author: "operator",
            origin: "OPERATOR",
            createdAt: "2026-07-18T12:01:00.000Z",
          },
        ],
        nextCursor: "older-cursor",
      })
      .mockImplementationOnce(async () => {
        scrollHeight = 900;
        return {
          items: [
            {
              id: "message-old",
              channelId: "channel-1",
              content: "Старое сообщение",
              author: null,
              origin: "LEGACY",
              createdAt: "2026-07-17T12:00:00.000Z",
            },
          ],
          nextCursor: null,
        };
      });

    render(<MessagesView workspaceId="workspace-a" />);
    const loadPrevious = await screen.findByRole("button", {
      name: "Загрузить предыдущие",
    });
    const timeline = screen.getByTestId("message-timeline");
    Object.defineProperty(timeline, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    timeline.scrollTop = 200;

    await user.click(loadPrevious);

    expect(await screen.findByText("Старое сообщение")).toBeInTheDocument();
    await waitFor(() => expect(timeline.scrollTop).toBe(500));
    expect(mocks.fetchMessages).toHaveBeenLastCalledWith("channel-1", {
      cursor: "older-cursor",
      sort: "desc",
    });
  });

  it("uses unique collapse regions in the desktop rail and mobile sheet", async () => {
    const user = userEvent.setup();
    mocks.isMobile.mockReturnValue(true);
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Команда",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);

    render(<MessagesView workspaceId="workspace-a" />);
    await user.click(
      await screen.findByRole("button", { name: "Открыть каналы" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Категории и каналы",
    });
    expect(dialog).toHaveClass(
      "text-[var(--text-primary)]",
      "duration-0",
      "data-starting-style:opacity-100",
      "data-ending-style:opacity-100",
    );
    expect(dialog).not.toHaveClass(
      "data-starting-style:opacity-0",
      "data-ending-style:opacity-0",
    );
    const toggles = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-controls]"),
    ).filter((button) => button.textContent?.trim() === "Команда");
    expect(toggles).toHaveLength(2);

    const sheetToggle = within(dialog).getByRole("button", {
      name: "Команда",
    });
    const railToggle = toggles.find((toggle) => toggle !== sheetToggle)!;
    const sheetRegionId = sheetToggle.getAttribute("aria-controls")!;
    const railRegionId = railToggle.getAttribute("aria-controls")!;
    expect(sheetRegionId).not.toBe(railRegionId);

    const sheetRegion = document.getElementById(sheetRegionId)!;
    const railRegion = document.getElementById(railRegionId)!;
    expect(dialog).toContainElement(sheetRegion);
    expect(dialog).not.toContainElement(railRegion);
    expect(sheetRegion).not.toHaveAttribute("hidden");
    expect(railRegion).not.toHaveAttribute("hidden");

    await user.click(sheetToggle);
    expect(sheetToggle).toHaveAttribute("aria-expanded", "false");
    expect(sheetRegion).toHaveAttribute("hidden");
    expect(railRegion).toHaveAttribute("hidden");
  });
});
