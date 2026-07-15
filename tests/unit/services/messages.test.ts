import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as messagesService from "@/lib/services/messages";
import { ChannelNotFoundError } from "@/lib/services/messages";

const NAME_PREFIX = `msg-${randomUUID()}`;
let workspaceId: string;
let workspaceBId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const workspaceB = await db.workspace.create({
    data: {
      name: "Test Workspace B",
      slug: `test-b-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceBId = workspaceB.id;
});

afterAll(async () => {
  await db.messageCategory.deleteMany({
    where: { name: { startsWith: NAME_PREFIX } },
  });
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (workspaceBId) {
    await db.workspace
      .delete({ where: { id: workspaceBId } })
      .catch(() => {});
  }
});

describe("AC-MSG-001: createCategory + listCategories", () => {
  it("creates a category that is persisted and returned by listCategories()", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-infra`,
    );
    expect(category.name).toBe(`${NAME_PREFIX}-infra`);

    const categories = await messagesService.listCategories(workspaceId);
    expect(categories.some((c) => c.id === category.id)).toBe(true);
  });
});

describe("AC-MSG-002: createChannel nested under category", () => {
  it("creates a channel that is persisted and displayed nested under its category", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-devtools`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "general",
    );
    expect(channel.messageCategoryId).toBe(category.id);

    const categories = await messagesService.listCategories(workspaceId);
    const found = categories.find((c) => c.id === category.id);
    expect(found?.channels.some((ch) => ch.id === channel.id)).toBe(true);
  });
});

describe("AC-MSG-003: renameCategory / deleteCategory / renameChannel / deleteChannel", () => {
  it("renameCategory persists the new name", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-old-name`,
    );
    const renamed = await messagesService.renameCategory(
      category.id,
      workspaceId,
      `${NAME_PREFIX}-new-name`,
    );
    expect(renamed.name).toBe(`${NAME_PREFIX}-new-name`);
  });

  it("renameChannel persists the new name", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-rename-channel-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "old-channel-name",
    );
    const renamed = await messagesService.renameChannel(
      channel.id,
      workspaceId,
      "new-channel-name",
    );
    expect(renamed.name).toBe("new-channel-name");
  });

  it("deleteCategory cascades to its channels and messages (no orphans)", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-cascade-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "cascade-channel",
    );
    const message = await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "hello",
    });

    await messagesService.deleteCategory(category.id, workspaceId);

    const remainingCategories = await db.messageCategory.findMany({
      where: { id: category.id },
    });
    const remainingChannels = await db.channel.findMany({
      where: { id: channel.id },
    });
    const remainingMessages = await db.message.findMany({
      where: { id: message.id },
    });
    expect(remainingCategories).toHaveLength(0);
    expect(remainingChannels).toHaveLength(0);
    expect(remainingMessages).toHaveLength(0);
  });

  it("deleteChannel cascades to its messages (no orphans)", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-cascade-channel-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "delete-channel",
    );
    const message = await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "will be cascaded",
    });

    await messagesService.deleteChannel(channel.id, workspaceId);

    const remainingChannels = await db.channel.findMany({
      where: { id: channel.id },
    });
    const remainingMessages = await db.message.findMany({
      where: { id: message.id },
    });
    expect(remainingChannels).toHaveLength(0);
    expect(remainingMessages).toHaveLength(0);
  });
});

describe("AC-MSG-004/009/010: createMessage + chronological listing + attribution", () => {
  it("creates an operator message (no author) that becomes visible", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-operator-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "operator-channel",
    );
    const message = await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "operator says hi",
    });

    const stored = await db.message.findUnique({ where: { id: message.id } });
    expect(stored?.content).toBe("operator says hi");
    expect(stored?.author).toBeNull();
  });

  it("creates a webhook message with author attribution", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-webhook-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "webhook-channel",
    );
    const message = await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "webhook payload",
      author: "monitoring-bot",
    });

    const stored = await db.message.findUnique({ where: { id: message.id } });
    expect(stored?.content).toBe("webhook payload");
    expect(stored?.author).toBe("monitoring-bot");
  });

  it("AC-MSG-011: distinguishes operator-origin (no author) from webhook-origin (author set) messages in the same channel feed", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-mixed-origin-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "mixed-origin-channel",
    );
    await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "from operator",
    });
    await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "from webhook",
      author: "ci-bot",
    });

    const { items } = await messagesService.listMessages(
      workspaceId,
      channel.id,
      {},
    );
    const operatorMsg = items.find((m) => m.content === "from operator");
    const webhookMsg = items.find((m) => m.content === "from webhook");
    expect(operatorMsg?.author).toBeNull();
    expect(webhookMsg?.author).toBe("ci-bot");
  });
});

describe("ChannelNotFoundError", () => {
  it("throws when createMessage targets a non-existent channelId", async () => {
    await expect(
      messagesService.createMessage(workspaceId, {
        channelId: "non-existent-channel-id",
        content: "hello",
      }),
    ).rejects.toThrow(ChannelNotFoundError);
  });

  it("throws when createMessage targets a channel belonging to a different workspace", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-cross-ws-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "cross-ws-channel",
    );

    await expect(
      messagesService.createMessage(workspaceBId, {
        channelId: channel.id,
        content: "hello from wrong workspace",
      }),
    ).rejects.toThrow(ChannelNotFoundError);
  });
});

describe("AC-MSG-007: listMessages keyset cursor pagination", () => {
  it("paginates ascending and descending with stable ordering and no duplicates/omissions", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-pagination-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "pagination-channel",
    );

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const message = await messagesService.createMessage(workspaceId, {
        channelId: channel.id,
        content: `message-${i}`,
      });
      created.push(message.id);
    }

    // descending (default): first page, page size 2
    const page1 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "desc" },
    );
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "desc", cursor: page1.nextCursor! },
    );
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "desc", cursor: page2.nextCursor! },
    );
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allDescIds = [...page1.items, ...page2.items, ...page3.items].map(
      (m) => m.id,
    );
    expect(new Set(allDescIds).size).toBe(5);
    expect(allDescIds.sort()).toEqual([...created].sort());

    // ascending: chronological order, oldest first
    const ascPage1 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "asc" },
    );
    expect(ascPage1.items.map((m) => m.content)).toEqual([
      "message-0",
      "message-1",
    ]);

    const ascPage2 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "asc", cursor: ascPage1.nextCursor! },
    );
    expect(ascPage2.items.map((m) => m.content)).toEqual([
      "message-2",
      "message-3",
    ]);
  });
});

describe("Workspace isolation", () => {
  it("categories/channels/messages from workspace A are not visible in workspace B", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-isolation-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "isolation-channel",
    );
    await messagesService.createMessage(workspaceId, {
      channelId: channel.id,
      content: "isolated message",
    });

    const categoriesInB = await messagesService.listCategories(workspaceBId);
    expect(categoriesInB.some((c) => c.id === category.id)).toBe(false);

    const { items } = await messagesService.listMessages(
      workspaceBId,
      channel.id,
      {},
    );
    expect(items).toHaveLength(0);
  });
});

function encodeCursorForWorkspace(
  workspaceId: string,
  entry: { createdAt: Date; id: string },
): string {
  return Buffer.from(
    JSON.stringify({
      w: workspaceId,
      t: entry.createdAt.toISOString(),
      id: entry.id,
    }),
  ).toString("base64url");
}

describe("Cursor workspace-binding", () => {
  it("silently resets (ignores) a cursor whose embedded workspace does not match the query workspace", async () => {
    const category = await messagesService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-cursor-binding-cat`,
    );
    const channel = await messagesService.createChannel(
      workspaceId,
      category.id,
      "cursor-binding-channel",
    );
    for (let i = 0; i < 3; i++) {
      await messagesService.createMessage(workspaceId, {
        channelId: channel.id,
        content: `bound-${i}`,
      });
    }

    const page1 = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "desc" },
    );
    expect(page1.items).toHaveLength(2);

    // Craft a cursor that points past the first page but is tagged with a
    // different workspaceId than the one used to query. Because the cursor's
    // `w` doesn't match the query workspace, the service must ignore it
    // entirely (reset to no cursor) rather than apply it or error.
    const foreignCursor = encodeCursorForWorkspace(workspaceBId, {
      createdAt: page1.items[page1.items.length - 1].createdAt,
      id: page1.items[page1.items.length - 1].id,
    });

    const resultWithForeignCursor = await messagesService.listMessages(
      workspaceId,
      channel.id,
      { pageSize: 2, sort: "desc", cursor: foreignCursor },
    );

    // A reset cursor behaves identically to no cursor at all: it returns the
    // same first page rather than continuing from the (foreign) position.
    expect(resultWithForeignCursor.items.map((m) => m.id)).toEqual(
      page1.items.map((m) => m.id),
    );
  });
});
