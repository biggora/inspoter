import { describe, expect, it, vi } from "vitest";

import {
  createMessagesTools,
  type MessagesToolDeps,
} from "@/components/messages/web-mcp-tools";
import type {
  ChannelWebhookDto,
  MessageCategoryDto,
  MessageDto,
} from "@/components/messages/api";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const NOW = "2026-01-01T00:00:00.000Z";

function makeCategories(): MessageCategoryDto[] {
  return [
    {
      id: "cat-1",
      name: "Incidents",
      channels: [
        {
          id: "chan-1",
          messageCategoryId: "cat-1",
          name: "prod",
          unreadCount: 3,
        },
        { id: "chan-2", messageCategoryId: "cat-1", name: "staging" },
      ],
    },
    { id: "cat-2", name: "Empty", channels: [] },
  ];
}

function makeMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: "msg-1",
    channelId: "chan-1",
    content: "Edge node restarted.",
    author: "alice",
    origin: "OPERATOR",
    createdAt: NOW,
    ...overrides,
  };
}

function makeWebhook(): ChannelWebhookDto {
  return {
    id: "hook-1",
    channelId: "chan-1",
    name: "Grafana",
    tokenPrefix: "whk_abcd",
    createdAt: NOW,
    lastUsedAt: null,
    revokedAt: null,
  };
}

function makeDeps(overrides: Partial<MessagesToolDeps> = {}): MessagesToolDeps {
  return {
    listCategories: vi.fn().mockResolvedValue(makeCategories()),
    fetchMessages: vi
      .fn()
      .mockResolvedValue({ items: [makeMessage()], nextCursor: "cur-2" }),
    sendMessage: vi.fn().mockResolvedValue({ id: "msg-new" }),
    markChannelRead: vi.fn().mockResolvedValue({ updated: 3 }),
    createCategory: vi
      .fn()
      .mockResolvedValue({ id: "cat-new", name: "Ops", channels: [] }),
    renameCategory: vi
      .fn()
      .mockResolvedValue({ id: "cat-1", name: "Renamed", channels: [] }),
    removeCategory: vi.fn().mockResolvedValue(undefined),
    createChannel: vi.fn().mockResolvedValue({
      id: "chan-new",
      messageCategoryId: "cat-1",
      name: "alerts",
    }),
    renameChannel: vi.fn().mockResolvedValue({
      id: "chan-1",
      messageCategoryId: "cat-1",
      name: "renamed",
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    listWebhooks: vi.fn().mockResolvedValue([makeWebhook()]),
    refresh: vi.fn(),
    ...overrides,
  };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

const EXPECTED_TOOL_NAMES = [
  "message_categories_list",
  "messages_list",
  "message_channel_get",
  "channel_webhooks_list",
  "message_send",
  "message_category_create",
  "message_category_rename",
  "message_category_delete",
  "message_channel_create",
  "message_channel_rename",
  "message_channel_delete",
  "message_channel_mark_read",
];

describe("createMessagesTools", () => {
  it("exposes exactly the expected tool names", () => {
    const names = createMessagesTools(makeDeps()).map((tool) => tool.name);

    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("gives every tool a non-empty title", () => {
    for (const tool of createMessagesTools(makeDeps())) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  // The write half of webhooks is deliberately absent: the create response
  // carries the full ingest url including its secret.
  it("exposes no webhook create or revoke tool", () => {
    const names = createMessagesTools(makeDeps()).map((tool) => tool.name);

    expect(names).not.toContain("channel_webhook_create");
    expect(names).not.toContain("channel_webhook_revoke");
  });

  it("flags read tools read-only and their output untrusted", () => {
    const tools = createMessagesTools(makeDeps());

    for (const name of [
      "message_categories_list",
      "messages_list",
      "message_channel_get",
      "channel_webhooks_list",
    ]) {
      expect(toolNamed(tools, name).annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: true,
      });
    }
    expect(toolNamed(tools, "message_send").annotations.readOnlyHint).toBe(
      false,
    );
  });
});

describe("message_categories_list", () => {
  it("flattens the category tree into rows carrying both ids and both names", async () => {
    const tools = createMessagesTools(makeDeps());

    const result = await toolNamed(tools, "message_categories_list").execute(
      {},
    );

    expect(expectToolJson(result)).toEqual({
      rows: [
        {
          categoryId: "cat-1",
          categoryName: "Incidents",
          channelId: "chan-1",
          channelName: "prod",
          unreadCount: 3,
        },
        {
          categoryId: "cat-1",
          categoryName: "Incidents",
          channelId: "chan-2",
          channelName: "staging",
        },
        {
          categoryId: "cat-2",
          categoryName: "Empty",
          channelId: null,
          channelName: null,
        },
      ],
    });
  });

  it("surfaces a rejecting list call as an error result", async () => {
    const deps = makeDeps({
      listCategories: vi.fn().mockRejectedValue(new Error("Network down.")),
    });

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_categories_list",
    ).execute({});

    expect(expectToolError(result)).toBe("Network down.");
  });
});

describe("messages_list", () => {
  it("forwards the cursor and sort and returns a compact projection", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "messages_list",
    ).execute({ channelId: "chan-1", cursor: "cur-1", sort: "asc" });

    expect(deps.fetchMessages).toHaveBeenCalledWith("chan-1", {
      cursor: "cur-1",
      sort: "asc",
    });
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-1",
      messages: [
        {
          id: "msg-1",
          author: "alice",
          origin: "OPERATOR",
          content: "Edge node restarted.",
          createdAt: NOW,
        },
      ],
      nextCursor: "cur-2",
      truncated: false,
    });
  });

  it("truncates long message content", async () => {
    const deps = makeDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        items: [makeMessage({ content: "x".repeat(500) })],
        nextCursor: null,
      }),
    });

    const result = await toolNamed(
      createMessagesTools(deps),
      "messages_list",
    ).execute({ channelId: "chan-1" });
    const { messages } = expectToolJson<{ messages: { content: string }[] }>(
      result,
    );

    expect(messages[0].content).toHaveLength(201);
    expect(messages[0].content.endsWith("…")).toBe(true);
  });

  // A trimmed page's cursor points past the rows that were cut, so handing it
  // back would silently skip them.
  it("trims the page to limit and withholds the cursor", async () => {
    const deps = makeDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({ id: "msg-1" }),
          makeMessage({ id: "msg-2" }),
          makeMessage({ id: "msg-3" }),
        ],
        nextCursor: "cur-2",
      }),
    });

    const result = await toolNamed(
      createMessagesTools(deps),
      "messages_list",
    ).execute({ channelId: "chan-1", limit: 2 });
    const payload = expectToolJson<{
      messages: { id: string }[];
      nextCursor: string | null;
      truncated: boolean;
    }>(result);

    expect(payload.messages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
    expect(payload.nextCursor).toBeNull();
    expect(payload.truncated).toBe(true);
  });

  it("rejects a limit above 50 without calling the api", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "messages_list",
    ).execute({ channelId: "chan-1", limit: 51 });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.fetchMessages).not.toHaveBeenCalled();
  });
});

describe("message_channel_get", () => {
  it("returns the flat row for the requested channel", async () => {
    const result = await toolNamed(
      createMessagesTools(makeDeps()),
      "message_channel_get",
    ).execute({ channelId: "chan-2" });

    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-1",
      categoryName: "Incidents",
      channelId: "chan-2",
      channelName: "staging",
    });
  });

  it("errors with a pointer to the listing tool for an unknown channel", async () => {
    const result = await toolNamed(
      createMessagesTools(makeDeps()),
      "message_channel_get",
    ).execute({ channelId: "chan-nope" });

    expect(expectToolError(result)).toContain("message_categories_list");
  });
});

describe("channel_webhooks_list", () => {
  it("returns the token prefix and never a secret url", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "channel_webhooks_list",
    ).execute({ channelId: "chan-1" });

    expect(deps.listWebhooks).toHaveBeenCalledWith("chan-1");
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-1",
      webhooks: [
        {
          id: "hook-1",
          name: "Grafana",
          tokenPrefix: "whk_abcd",
          createdAt: NOW,
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    });
  });
});

describe("messages mutations", () => {
  it("message_send forwards the channel and content, then refreshes", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_send",
    ).execute({ channelId: "chan-1", content: "  deploying  " });

    expect(deps.sendMessage).toHaveBeenCalledWith("chan-1", "deploying");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      messageId: "msg-new",
      channelId: "chan-1",
    });
  });

  it("message_send rejects empty content without calling the api", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_send",
    ).execute({ channelId: "chan-1", content: "   " });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("message_category_create forwards the name, then refreshes", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_category_create",
    ).execute({ name: "Ops" });

    expect(deps.createCategory).toHaveBeenCalledWith("Ops");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-new",
      categoryName: "Ops",
    });
  });

  // The POST route calls messagesService.createCategory, not the
  // findOrCreateCategoryByName the server MCP catalog uses, so there is no
  // `created` flag to mirror — the description says so instead of faking one.
  it("message_category_create reports no created flag and documents duplication", () => {
    const tool = toolNamed(
      createMessagesTools(makeDeps()),
      "message_category_create",
    );

    expect(tool.description).toContain("NOT get-or-create");
  });

  it("message_category_rename forwards id and name, then refreshes", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_category_rename",
    ).execute({ categoryId: "cat-1", name: "Renamed" });

    expect(deps.renameCategory).toHaveBeenCalledWith("cat-1", "Renamed");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-1",
      categoryName: "Renamed",
    });
  });

  it("message_category_delete forwards the id, warns, then refreshes", async () => {
    const deps = makeDeps();
    const tool = toolNamed(
      createMessagesTools(deps),
      "message_category_delete",
    );

    const result = await tool.execute({ categoryId: "cat-1" });

    expect(tool.description).toContain("DESTRUCTIVE");
    expect(deps.removeCategory).toHaveBeenCalledWith("cat-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-1",
      deleted: true,
    });
  });

  it("message_channel_create forwards category and name, then refreshes", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_channel_create",
    ).execute({ categoryId: "cat-1", name: "alerts" });

    expect(deps.createChannel).toHaveBeenCalledWith("cat-1", "alerts");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-new",
      channelName: "alerts",
      categoryId: "cat-1",
    });
  });

  it("message_channel_rename forwards id and name, then refreshes", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_channel_rename",
    ).execute({ channelId: "chan-1", name: "renamed" });

    expect(deps.renameChannel).toHaveBeenCalledWith("chan-1", "renamed");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-1",
      channelName: "renamed",
    });
  });

  // Message.channel is onDelete: Cascade in prisma/schema.prisma, so the
  // description's claim about the message history is accurate.
  it("message_channel_delete warns that the message history goes with it", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createMessagesTools(deps), "message_channel_delete");

    const result = await tool.execute({ channelId: "chan-1" });

    expect(tool.description).toContain("DESTRUCTIVE");
    expect(tool.description).toContain("message history");
    expect(deps.removeChannel).toHaveBeenCalledWith("chan-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-1",
      deleted: true,
    });
  });

  it("message_channel_mark_read forwards the id and reports the count", async () => {
    const deps = makeDeps();

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_channel_mark_read",
    ).execute({ channelId: "chan-1" });

    expect(deps.markChannelRead).toHaveBeenCalledWith("chan-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      channelId: "chan-1",
      updated: 3,
    });
  });

  it("surfaces a rejecting mutation as an error result without refreshing", async () => {
    const deps = makeDeps({
      sendMessage: vi.fn().mockRejectedValue(new Error("Channel is gone.")),
    });

    const result = await toolNamed(
      createMessagesTools(deps),
      "message_send",
    ).execute({ channelId: "chan-1", content: "hi" });

    expect(expectToolError(result)).toBe("Channel is gone.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
