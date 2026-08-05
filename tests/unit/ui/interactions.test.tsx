// @vitest-environment jsdom

import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { NextIntlClientProvider } from "next-intl";

import { renderWithIntl } from "../../test-utils";
import { BookmarkCard } from "@/components/bookmarks/bookmark-card";
import { ColorPicker } from "@/components/bookmarks/color-picker";
import { LogsView } from "@/components/logs/logs-view";
import { MessagesView } from "@/components/messages/messages-view";
import type { Bookmark } from "@/generated/prisma/client";
import { enMessages } from "@/i18n/messages";

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
  markChannelRead: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: mocks.refresh,
  }),
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
    markChannelRead: mocks.markChannelRead,
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
    mocks.markChannelRead.mockResolvedValue({ updated: 0 });
  });

  it("keeps ColorPicker controlled, arrow-navigable, and looping", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return <ColorPicker value={value} onChange={setValue} />;
    }

    renderWithIntl(<Harness />);
    expect(screen.getByRole("group", { name: "Color" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    const none = screen.getByRole("button", { name: "No color" });
    const secondary = screen.getByRole("button", { name: "Olive" });

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

    renderWithIntl(
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
      name: 'Reorder: "Documentation"',
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
      name: "Show log entry details",
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
        name: "Team",
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

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    const composer = await screen.findByPlaceholderText("Message #general...");
    await user.type(composer, "First line{Enter}Second line");

    expect(composer).toHaveValue("First line\nSecond line");
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      expect(composer).toHaveValue("");
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      "channel-1",
      "First line\nSecond line",
    );
    expect(mocks.fetchMessages).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Attach file/)).not.toBeInTheDocument();
  });

  it("preserves a failed message draft and associates the error", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Team",
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
    mocks.sendMessage.mockRejectedValue(new Error("Service is unavailable"));

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    const composer = await screen.findByRole("textbox", {
      name: "Message in channel #general",
    });
    await user.type(composer, "Do not lose me");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(composer).toHaveValue("Do not lose me"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Service is unavailable",
    );
  });

  it("shows a new channel webhook URL only until settings close", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Team",
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

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    const headerOpener = await screen.findByRole("button", {
      name: 'Settings for channel "general"',
    });
    await user.click(headerOpener);
    const dialog = await screen.findByRole("dialog", {
      name: "Settings for channel #general",
    });
    await user.click(within(dialog).getByRole("tab", { name: "Webhooks" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Webhook name" }),
      "CI pipeline",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create webhook" }),
    );

    const url = await within(dialog).findByRole("textbox", {
      name: "Webhook URL",
    });
    expect(url).toHaveValue(
      "http://localhost:3000/api/webhooks/channels/webhook-1/one-time-secret",
    );
    expect(mocks.createChannelWebhook).toHaveBeenCalledWith(
      "channel-1",
      "CI pipeline",
    );

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
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
        name: "Team",
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

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    await screen.findByRole("heading", { name: "general" });
    const rowOpener = screen.getByRole("button", {
      name: 'Actions for channel "general"',
    });
    await user.click(rowOpener);
    await user.click(
      await screen.findByRole("menuitem", { name: "Channel settings" }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Settings for channel #general",
    });
    await user.click(within(settings).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(document.activeElement).toBe(rowOpener));
  });

  it("restores channel settings focus to the exact mobile Sheet row opener", async () => {
    const user = userEvent.setup();
    mocks.listCategories.mockResolvedValue([
      {
        id: "category-1",
        name: "Team",
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

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    await user.click(
      await screen.findByRole("button", { name: "Open channels" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Categories and channels",
    });
    const sheetOpener = within(sheet).getByRole("button", {
      name: 'Actions for channel "general"',
    });
    await user.click(sheetOpener);
    await user.click(
      await screen.findByRole("menuitem", { name: "Channel settings" }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Settings for channel #general",
    });
    await user.click(within(settings).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(document.activeElement).toBe(sheetOpener));
  });

  it("remounts all Messages state when the workspace identity changes", async () => {
    const user = userEvent.setup();
    mocks.listCategories
      .mockResolvedValueOnce([
        {
          id: "category-a",
          name: "Team A",
          channels: [
            {
              id: "channel-a",
              messageCategoryId: "category-a",
              name: "channel-a",
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "category-b",
          name: "Team B",
          channels: [
            {
              id: "channel-b",
              messageCategoryId: "category-b",
              name: "channel-b",
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
                content: "Message A",
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
        name: "Integration A",
        tokenPrefix: "prefix-a",
        createdAt: "2026-07-18T12:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
      url: "/api/webhooks/channels/webhook-a/transient-value",
    });

    const view = renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    const draft = await screen.findByRole("textbox", {
      name: "Message in channel #channel-a",
    });
    await user.type(draft, "Draft A");
    expect(await screen.findByText("Message A")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load previous" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: 'Settings for channel "channel-a"' }),
    );
    const settings = await screen.findByRole("dialog", {
      name: "Settings for channel #channel-a",
    });
    await user.click(within(settings).getByRole("tab", { name: "Webhooks" }));
    await user.type(
      within(settings).getByRole("textbox", { name: "Webhook name" }),
      "Integration A",
    );
    await user.click(
      within(settings).getByRole("button", { name: "Create webhook" }),
    );
    expect(
      await within(settings).findByRole("textbox", { name: "Webhook URL" }),
    ).toBeInTheDocument();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <MessagesView workspaceId="workspace-b" />
      </NextIntlClientProvider>,
    );

    const workspaceBDraft = await screen.findByRole("textbox", {
      name: "Message in channel #channel-b",
    });
    expect(workspaceBDraft).toHaveValue("");
    expect(
      screen.queryByRole("heading", { name: "channel-a" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Message A")).not.toBeInTheDocument();
    expect(screen.queryByText("Draft A")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load previous" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Settings for channel #channel-a" }),
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
        name: "Team",
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
          content: "Operator reply",
          author: "operator",
          origin: "OPERATOR",
          createdAt: "2026-07-18T12:01:00.000Z",
        },
        {
          id: "message-3",
          channelId: "channel-1",
          content: "Historic message",
          author: null,
          origin: "LEGACY",
          createdAt: "2026-07-18T12:02:00.000Z",
        },
      ],
      nextCursor: null,
    });

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);

    expect(await screen.findByText("External source")).toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
    expect(screen.getByText("Source unknown")).toBeInTheDocument();
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
        name: "Team",
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
            content: "New message",
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
              content: "Old message",
              author: null,
              origin: "LEGACY",
              createdAt: "2026-07-17T12:00:00.000Z",
            },
          ],
          nextCursor: null,
        };
      });

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    const loadPrevious = await screen.findByRole("button", {
      name: "Load previous",
    });
    const timeline = screen.getByTestId("message-timeline");
    Object.defineProperty(timeline, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    timeline.scrollTop = 200;

    await user.click(loadPrevious);

    expect(await screen.findByText("Old message")).toBeInTheDocument();
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
        name: "Team",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "general",
          },
        ],
      },
    ]);

    renderWithIntl(<MessagesView workspaceId="workspace-a" />);
    await user.click(
      await screen.findByRole("button", { name: "Open channels" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Categories and channels",
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
    ).filter((button) => button.textContent?.trim() === "Team");
    expect(toggles).toHaveLength(2);

    const sheetToggle = within(dialog).getByRole("button", {
      name: "Team",
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
