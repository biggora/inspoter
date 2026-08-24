import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type {
  ChannelDto,
  ChannelWebhookDto,
  FetchMessagesParams,
  FetchMessagesResult,
  MessageCategoryDto,
} from "./api";

// WebMCP tools for Messages — the browser-side counterpart of the server MCP
// catalog in src/lib/mcp/tools/messages.ts. Tool names match that catalog
// wherever an equivalent exists, so an agent that knows one surface knows the
// other; the two registries are separate, so the shared names never collide.
//
// Two deliberate departures from the server catalog:
//  * Deletion IS offered here (the dashboard has the buttons for it), marked
//    destructive in the descriptions.
//  * `channel_webhook_create` / `channel_webhook_revoke` are NOT offered.
//    The create response (CreatedChannelWebhookDto) carries the full ingest
//    `url` including its secret; an agent echoing that into a transcript is a
//    credential leak, so the write half of webhooks stays an operator action.
//    `channel_webhooks_list` returns only the token prefix and is safe.

export interface MessagesToolDeps {
  /** Bound messageCategoriesApi.list — categories with their nested channels. */
  listCategories: () => Promise<MessageCategoryDto[]>;
  /** Bound fetchMessages. */
  fetchMessages: (
    channelId: string,
    params: FetchMessagesParams,
  ) => Promise<FetchMessagesResult>;
  /** Bound sendMessage. */
  sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
  /** Bound markChannelRead. */
  markChannelRead: (channelId: string) => Promise<{ updated: number }>;
  /** Bound messageCategoriesApi.create. */
  createCategory: (name: string) => Promise<MessageCategoryDto>;
  /** Bound messageCategoriesApi.rename. */
  renameCategory: (id: string, name: string) => Promise<MessageCategoryDto>;
  /** Bound messageCategoriesApi.remove. */
  removeCategory: (id: string) => Promise<void>;
  /** Bound channelsApi.create. */
  createChannel: (categoryId: string, name: string) => Promise<ChannelDto>;
  /** Bound channelsApi.rename. */
  renameChannel: (id: string, name: string) => Promise<ChannelDto>;
  /** Bound channelsApi.remove. */
  removeChannel: (id: string) => Promise<void>;
  /** Bound channelWebhooksApi.list. */
  listWebhooks: (channelId: string) => Promise<ChannelWebhookDto[]>;
  /** Re-runs the server fetch so any visible messages UI reflects the change. */
  refresh: () => void;
}

/** Keeps a default-sized page well inside the ~1500-char output budget. */
const MAX_CONTENT_LENGTH = 200;
const DEFAULT_PAGE_SIZE = 10;
// Matches the server's default page size (env.LIST_PAGE_SIZE = 50): at this
// limit nothing is ever trimmed, so cursor paging always works.
const MAX_PAGE_SIZE = 50;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Trims a fetched page down to `limit`. A trimmed page drops its `nextCursor`:
 * the cursor points past the whole page, so handing it back would silently
 * skip the rows that were cut.
 */
function trimPage<T>(
  items: T[],
  nextCursor: string | null,
  limit: number,
): { items: T[]; nextCursor: string | null; truncated: boolean } {
  const truncated = items.length > limit;
  return {
    items: items.slice(0, limit),
    nextCursor: truncated ? null : nextCursor,
    truncated,
  };
}

const channelIdSchema = z
  .string()
  .min(1)
  .describe("Channel id from message_categories_list");

const categoryIdSchema = z
  .string()
  .min(1)
  .describe("Category id from message_categories_list");

const nameSchema = z.string().trim().min(1).max(120);

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE)
  .describe("Maximum rows to return");

const sortSchema = z
  .enum(["asc", "desc"])
  .optional()
  .describe("desc (default) is newest-first");

const cursorSchema = z
  .string()
  .min(1)
  .optional()
  .describe("nextCursor from a previous response");

interface FlatChannelRow {
  categoryId: string;
  categoryName: string;
  channelId: string | null;
  channelName: string | null;
  unreadCount?: number;
}

// The API returns a category->channel tree; a flat row carrying both ids and
// both names is what makes the result readable to a model. A category with no
// channels still gets a row, so its id stays discoverable for
// message_channel_create.
function flattenCategories(categories: MessageCategoryDto[]): FlatChannelRow[] {
  return categories.flatMap<FlatChannelRow>((category) => {
    if (category.channels.length === 0) {
      return [
        {
          categoryId: category.id,
          categoryName: category.name,
          channelId: null,
          channelName: null,
        },
      ];
    }
    return category.channels.map((channel) => ({
      categoryId: category.id,
      categoryName: category.name,
      channelId: channel.id,
      channelName: channel.name,
      ...(channel.unreadCount === undefined
        ? {}
        : { unreadCount: channel.unreadCount }),
    }));
  });
}

function findChannelRow(
  categories: MessageCategoryDto[],
  channelId: string,
): FlatChannelRow {
  const row = flattenCategories(categories).find(
    (candidate) => candidate.channelId === channelId,
  );
  if (!row) {
    throw new Error(
      `No channel with id "${channelId}". List them with message_categories_list.`,
    );
  }
  return row;
}

export function createMessagesTools(deps: MessagesToolDeps): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "message_categories_list",
      title: "List message categories and channels",
      description:
        "Lists every message category with its channels, one flat row per channel carrying categoryId, categoryName, channelId, channelName and the channel's unread count. A category with no channels gets a row with a null channelId. Ids from here are what every other messages tool takes.",
      inputSchema: z.object({}).strict(),
      readOnly: true,
      // Category and channel names are operator-authored free text.
      untrustedOutput: true,
      async handler() {
        return { rows: flattenCategories(await deps.listCategories()) };
      },
    }),

    defineWebMcpTool({
      name: "messages_list",
      title: "Read a channel's messages",
      description:
        "Reads one channel's messages, newest-first unless sort is overridden. Message bodies are truncated. Page with the returned nextCursor; when truncated is true the page held more rows than limit and nextCursor is withheld — raise limit (up to 50) to page on.",
      inputSchema: z
        .object({
          channelId: channelIdSchema,
          limit: limitSchema,
          sort: sortSchema,
          cursor: cursorSchema,
        })
        .strict(),
      readOnly: true,
      // Message bodies come from operators, webhooks and other agents.
      untrustedOutput: true,
      async handler({ channelId, limit, sort, cursor }) {
        const page = await deps.fetchMessages(channelId, { cursor, sort });
        const trimmed = trimPage(page.items, page.nextCursor, limit);
        return {
          channelId,
          messages: trimmed.items.map((message) => ({
            id: message.id,
            author: message.author,
            origin: message.origin,
            content: truncate(message.content, MAX_CONTENT_LENGTH),
            createdAt: message.createdAt,
          })),
          nextCursor: trimmed.nextCursor,
          truncated: trimmed.truncated,
        };
      },
    }),

    defineWebMcpTool({
      name: "message_channel_get",
      title: "Read one channel",
      description:
        "Reads a single channel by id — its name, the category it belongs to, and its unread count. Resolved from the same category list message_categories_list returns.",
      inputSchema: z.object({ channelId: channelIdSchema }).strict(),
      readOnly: true,
      // Returns operator-authored category and channel names.
      untrustedOutput: true,
      async handler({ channelId }) {
        return findChannelRow(await deps.listCategories(), channelId);
      },
    }),

    defineWebMcpTool({
      name: "channel_webhooks_list",
      title: "List a channel's webhooks",
      description:
        "Lists the ingest webhooks of one channel. Secrets are never returned — only the token prefix, and when the webhook was created, last used or revoked. Creating and revoking webhooks stays an operator action in the dashboard.",
      inputSchema: z.object({ channelId: channelIdSchema }).strict(),
      readOnly: true,
      // Webhook names are operator-authored free text.
      untrustedOutput: true,
      async handler({ channelId }) {
        const webhooks = await deps.listWebhooks(channelId);
        return {
          channelId,
          webhooks: webhooks.map((webhook) => ({
            id: webhook.id,
            name: webhook.name,
            tokenPrefix: webhook.tokenPrefix,
            createdAt: webhook.createdAt,
            lastUsedAt: webhook.lastUsedAt,
            revokedAt: webhook.revokedAt,
          })),
        };
      },
    }),

    defineWebMcpTool({
      name: "message_send",
      title: "Post a message to a channel",
      description:
        "Posts a message into a channel. It appears in the dashboard immediately, attributed to the signed-in operator, and cannot be edited or deleted afterwards.",
      inputSchema: z
        .object({
          channelId: channelIdSchema,
          content: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe("Message body to post"),
        })
        .strict(),
      readOnly: false,
      async handler({ channelId, content }) {
        const created = await deps.sendMessage(channelId, content);
        deps.refresh();
        return { messageId: created.id, channelId };
      },
    }),

    defineWebMcpTool({
      name: "message_category_create",
      title: "Create a message category",
      description:
        "Creates a message category. NOT get-or-create: this route always creates a new category, so calling it with a name that already exists produces a duplicate. Check message_categories_list first and reuse the existing id.",
      inputSchema: z
        .object({ name: nameSchema.describe("Category name") })
        .strict(),
      readOnly: false,
      async handler({ name }) {
        const category = await deps.createCategory(name);
        deps.refresh();
        return { categoryId: category.id, categoryName: category.name };
      },
    }),

    defineWebMcpTool({
      name: "message_category_rename",
      title: "Rename a message category",
      description: "Renames an existing message category.",
      inputSchema: z
        .object({
          categoryId: categoryIdSchema,
          name: nameSchema.describe("New category name"),
        })
        .strict(),
      readOnly: false,
      async handler({ categoryId, name }) {
        const category = await deps.renameCategory(categoryId, name);
        deps.refresh();
        return { categoryId: category.id, categoryName: category.name };
      },
    }),

    defineWebMcpTool({
      name: "message_category_delete",
      title: "Delete a message category",
      description:
        "DESTRUCTIVE and irreversible: deletes a message category together with every channel inside it and every message in those channels. Confirm with the operator before calling this.",
      inputSchema: z.object({ categoryId: categoryIdSchema }).strict(),
      readOnly: false,
      async handler({ categoryId }) {
        await deps.removeCategory(categoryId);
        deps.refresh();
        return { categoryId, deleted: true };
      },
    }),

    defineWebMcpTool({
      name: "message_channel_create",
      title: "Create a channel",
      description:
        "Creates a channel inside a category. NOT get-or-create: this route always creates a new channel, so calling it with a name that already exists in the category produces a duplicate. Check message_categories_list first and reuse the existing id.",
      inputSchema: z
        .object({
          categoryId: categoryIdSchema,
          name: nameSchema.describe("Channel name"),
        })
        .strict(),
      readOnly: false,
      async handler({ categoryId, name }) {
        const channel = await deps.createChannel(categoryId, name);
        deps.refresh();
        return {
          channelId: channel.id,
          channelName: channel.name,
          categoryId: channel.messageCategoryId,
        };
      },
    }),

    defineWebMcpTool({
      name: "message_channel_rename",
      title: "Rename a channel",
      description: "Renames an existing channel.",
      inputSchema: z
        .object({
          channelId: channelIdSchema,
          name: nameSchema.describe("New channel name"),
        })
        .strict(),
      readOnly: false,
      async handler({ channelId, name }) {
        const channel = await deps.renameChannel(channelId, name);
        deps.refresh();
        return { channelId: channel.id, channelName: channel.name };
      },
    }),

    defineWebMcpTool({
      name: "message_channel_delete",
      title: "Delete a channel",
      description:
        "DESTRUCTIVE and irreversible: deletes a channel together with its whole message history and its ingest webhooks. Confirm with the operator before calling this.",
      inputSchema: z.object({ channelId: channelIdSchema }).strict(),
      readOnly: false,
      async handler({ channelId }) {
        await deps.removeChannel(channelId);
        deps.refresh();
        return { channelId, deleted: true };
      },
    }),

    defineWebMcpTool({
      name: "message_channel_mark_read",
      title: "Mark a channel read",
      description:
        "Clears one channel's unread messages. Read state is per channel and workspace-wide, so this is the same action opening the channel in the dashboard performs.",
      inputSchema: z.object({ channelId: channelIdSchema }).strict(),
      readOnly: false,
      async handler({ channelId }) {
        const result = await deps.markChannelRead(channelId);
        deps.refresh();
        return { channelId, updated: result.updated };
      },
    }),
  ];
}
