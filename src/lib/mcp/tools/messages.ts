import { z } from "zod";
import * as messagesService from "@/lib/services/messages";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

// The Messages half of the agent surface: an assistant can lay out categories
// and channels, wire an external system to a channel through a webhook, and
// post into a channel. Everything it writes is stamped `origin: AGENT` so the
// timeline shows where it came from. Deletion is deliberately absent — losing
// a channel takes its whole message history with it, so that stays an
// operator action in the dashboard.

const channelId = z
  .string()
  .describe("Channel id from message_categories_list");
const content = z.string().trim().min(1).max(4_000);
const author = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .optional()
  .describe("Display name for the message; defaults to the API token's name");

async function requireChannel(workspaceId: string, id: string): Promise<void> {
  const channel = await messagesService.getChannelForWorkspace(workspaceId, id);
  if (!channel) throw new McpResourceNotFoundError("Channel", id);
}

export const messageTools: McpToolDefinition[] = [
  defineTool({
    name: "message_categories_list",
    scope: "messages:read",
    title: "List message categories and channels",
    description:
      "List the workspace's message categories with the channels in each. Ids from here are the categoryId and channelId every other messages tool takes.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => messagesService.listCategories(ctx.workspaceId),
  }),

  defineTool({
    name: "messages_list",
    scope: "messages:read",
    title: "Read a channel's messages",
    description:
      "Read one channel's messages, newest-first unless sort is overridden. Page with the returned nextCursor.",
    inputSchema: z.object({
      channelId,
      sort: z.enum(["asc", "desc"]).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z
        .string()
        .optional()
        .describe("Opaque cursor from a previous response's nextCursor"),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      await requireChannel(ctx.workspaceId, args.channelId);
      return messagesService.listMessages(
        ctx.workspaceId,
        args.channelId,
        args,
      );
    },
  }),

  defineTool({
    name: "message_channel_get",
    scope: "messages:read",
    title: "Read one channel",
    description:
      "Read a single channel by id — its name, the category it belongs to, and whether it still holds unread messages.",
    inputSchema: z.object({ channelId }),
    readOnly: true,
    handler: async (args, ctx) => {
      const channel = await messagesService.getChannelForWorkspace(
        ctx.workspaceId,
        args.channelId,
      );
      if (!channel) {
        throw new McpResourceNotFoundError("Channel", args.channelId);
      }
      return channel;
    },
  }),

  defineTool({
    name: "channel_webhooks_list",
    scope: "messages:read",
    title: "List a channel's webhooks",
    description:
      "List the ingest webhooks of one channel. Secrets are never returned — only the prefix, and when the webhook was last used or revoked.",
    inputSchema: z.object({ channelId }),
    readOnly: true,
    handler: (args, ctx) =>
      webhookTokensService.listForChannel(args.channelId, ctx.workspaceId),
  }),

  defineTool({
    name: "message_category_create",
    scope: "messages:write",
    title: "Create a message category",
    description:
      "Get or create a message category by name. Names are matched case-insensitively, so calling this with an existing name returns that category instead of duplicating it.",
    inputSchema: z.object({ name: z.string().trim().min(1).max(120) }),
    readOnly: false,
    handler: async (args, ctx) => {
      const { category, created } =
        await messagesService.findOrCreateCategoryByName(
          ctx.workspaceId,
          args.name,
        );
      return { ...category, created };
    },
  }),

  defineTool({
    name: "message_category_rename",
    scope: "messages:write",
    title: "Rename a message category",
    description: "Rename an existing message category.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(120),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      messagesService.renameCategory(args.id, ctx.workspaceId, args.name),
  }),

  defineTool({
    name: "message_channel_create",
    scope: "messages:write",
    title: "Create a channel",
    description:
      "Get or create a channel inside a category. Names are matched case-insensitively within the category, so re-running the same setup does not duplicate the channel.",
    inputSchema: z.object({
      categoryId: z
        .string()
        .describe("Category id from message_categories_list"),
      name: z.string().trim().min(1).max(120),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      const category = await messagesService.getCategoryForWorkspace(
        ctx.workspaceId,
        args.categoryId,
      );
      if (!category) {
        throw new McpResourceNotFoundError("Message category", args.categoryId);
      }
      const { channel, created } =
        await messagesService.findOrCreateChannelByName(
          ctx.workspaceId,
          args.categoryId,
          args.name,
        );
      return { ...channel, created };
    },
  }),

  defineTool({
    name: "message_channel_rename",
    scope: "messages:write",
    title: "Rename a channel",
    description: "Rename an existing channel.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(120),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      messagesService.renameChannel(args.id, ctx.workspaceId, args.name),
  }),

  defineTool({
    name: "message_send",
    scope: "messages:write",
    title: "Post a message to a channel",
    description:
      "Post a message into a channel. It appears in the dashboard immediately, labelled as coming from an agent, and cannot be edited or deleted afterwards.",
    inputSchema: z.object({ channelId, content, author }),
    readOnly: false,
    handler: (args, ctx) =>
      messagesService.createMessage(ctx.workspaceId, {
        channelId: args.channelId,
        content: args.content,
        author: args.author ?? ctx.tokenName,
        origin: "AGENT",
      }),
  }),

  defineTool({
    name: "message_channel_mark_read",
    scope: "messages:write",
    title: "Mark a channel read",
    description:
      "Clear one channel's unread messages. Read state is per channel and workspace-wide, so this is the same action opening the channel in the dashboard performs.",
    inputSchema: z.object({ channelId }),
    readOnly: false,
    handler: async (args, ctx) => {
      await requireChannel(ctx.workspaceId, args.channelId);
      return messagesService.markChannelRead(ctx.workspaceId, args.channelId);
    },
  }),

  defineTool({
    name: "channel_webhook_create",
    scope: "messages:write",
    title: "Create a channel webhook",
    description:
      "Create an ingest webhook for a channel so an external system can post into it. The returned url contains the secret and is shown only once — hand it to the operator or the system that needs it, and never repeat it back later.",
    inputSchema: z.object({
      channelId,
      name: z.string().trim().min(1).max(80).describe("What will post here"),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      webhookTokensService.createForChannel(
        args.channelId,
        ctx.workspaceId,
        args.name,
      ),
  }),

  defineTool({
    name: "channel_webhook_revoke",
    scope: "messages:write",
    title: "Revoke a channel webhook",
    description:
      "Revoke a channel webhook. Calls made with its url stop working immediately; already-posted messages are untouched.",
    inputSchema: z.object({ channelId, webhookId: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await webhookTokensService.revokeForChannel(
        args.channelId,
        args.webhookId,
        ctx.workspaceId,
      );
      return { id: args.webhookId, revoked: true };
    },
  }),
];
