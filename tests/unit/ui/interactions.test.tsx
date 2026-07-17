// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

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
  };
});

describe("standardized UI interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile.mockReturnValue(false);
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

    render(<LogsView />);
    const expand = await screen.findByRole("button", {
      name: "Показать детали записи журнала",
    });

    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("Preserved log contents")).toHaveLength(1);

    await user.click(expand);

    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Preserved log contents")).toHaveLength(2);
  });

  it("submits the message composer once on Enter and clears it", async () => {
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

    render(<MessagesView />);
    await user.click(
      await screen.findByRole("button", { name: /^#\s*general$/i }),
    );

    const composer = await screen.findByPlaceholderText(
      "Написать в #general...",
    );
    await user.type(composer, "Привет{Enter}");

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      expect(composer).toHaveValue("");
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith("channel-1", "Привет");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Прикрепить файл (недоступно)" }),
    ).toBeDisabled();
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

    render(<MessagesView />);
    await user.click(
      await screen.findByRole("button", { name: "Категории и каналы" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Категории и каналы",
    });
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
