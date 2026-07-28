import { z } from "zod";
import * as mailService from "@/lib/services/mail";
import * as mailAccounts from "@/lib/services/mail-accounts";
import * as mailLabels from "@/lib/services/mail-labels";
import * as mailDrafts from "@/lib/services/mail-drafts";
import { sendMail, MailItemNotFoundError } from "@/lib/services/mail-actions";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";

const cursor = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous response's nextCursor");
const pageSize = z.number().int().min(1).max(100).optional();
const addresses = z.array(z.email()).default([]);

const composeFields = {
  accountId: z
    .string()
    .describe("Sending IMAP account id from mail_accounts_list"),
  to: addresses,
  cc: addresses,
  bcc: addresses,
  subject: z.string().default(""),
  bodyText: z.string().default("").describe("Plain-text body"),
  bodyHtml: z
    .string()
    .default("")
    .describe("HTML body; leave empty to send text only"),
  inReplyToId: z
    .string()
    .optional()
    .describe("Id of the message being replied to"),
  forwardOfId: z
    .string()
    .optional()
    .describe("Id of the message being forwarded"),
};

export const mailTools: McpToolDefinition[] = [
  defineTool({
    name: "mail_accounts_list",
    scope: "mail:read",
    title: "List mail accounts",
    description:
      "List every mail account in the workspace. Only accounts with kind IMAP can send mail or hold drafts; the WEBHOOK account is inbound-only.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => mailAccounts.listAccounts(ctx.workspaceId),
  }),

  defineTool({
    name: "mail_folders_list",
    scope: "mail:read",
    title: "List mail folders",
    description:
      "List the folders of one mail account with their unread counts.",
    inputSchema: z.object({ accountId: z.string() }),
    readOnly: true,
    handler: (args, ctx) =>
      mailAccounts.listFoldersForAccount(args.accountId, ctx.workspaceId),
  }),

  defineTool({
    name: "mail_labels_list",
    scope: "mail:read",
    title: "List mail labels",
    description: "List the workspace's mail labels with message counts.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => mailLabels.listLabels(ctx.workspaceId),
  }),

  defineTool({
    name: "mail_search",
    scope: "mail:read",
    title: "Search mail",
    description:
      "Search mail across the workspace. `query` matches subject, sender address and sender name. Returns metadata only — use mail_get for the body.",
    inputSchema: z.object({
      query: z.string().optional(),
      from: z.string().optional().describe("Exact sender address"),
      accountId: z.string().optional(),
      folderId: z.string().optional(),
      labelId: z.string().optional(),
      unreadOnly: z.boolean().optional(),
      sort: z.enum(["asc", "desc"]).optional().describe("By received date"),
      pageSize,
      cursor,
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      const result = await mailService.list(ctx.workspaceId, args);
      return {
        items: result.items.map(mailService.toMailListItemDto),
        nextCursor: result.nextCursor,
      };
    },
  }),

  defineTool({
    name: "mail_get",
    scope: "mail:read",
    title: "Read a message",
    description:
      "Read one message with its full body and attachment metadata. Attachment bytes are not included.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const item = await mailService.getById(args.id, ctx.workspaceId);
      if (!item) throw new MailItemNotFoundError(args.id);
      return mailService.toMailDetailDto(item);
    },
  }),

  defineTool({
    name: "mail_draft_save",
    scope: "mail:write",
    title: "Create or update a draft",
    description:
      "Save a draft in the account's Drafts folder. Omit draftId to create a new draft, pass it to overwrite an existing one.",
    inputSchema: z.object({ draftId: z.string().optional(), ...composeFields }),
    readOnly: false,
    handler: (args, ctx) => mailDrafts.saveMailDraft(ctx.workspaceId, args),
  }),

  defineTool({
    name: "mail_send",
    scope: "mail:write",
    title: "Send mail",
    description:
      "Send a message over the account's SMTP transport and file a copy in Sent. Pass draftId to send an existing draft. This action cannot be undone.",
    inputSchema: z.object({ draftId: z.string().optional(), ...composeFields }),
    readOnly: false,
    handler: (args, ctx) => sendMail(ctx.workspaceId, args),
  }),
];
