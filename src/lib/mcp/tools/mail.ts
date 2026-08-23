import { z } from "zod";
import * as mailService from "@/lib/services/mail";
import * as mailAccounts from "@/lib/services/mail-accounts";
import * as mailLabels from "@/lib/services/mail-labels";
import * as mailDrafts from "@/lib/services/mail-drafts";
import * as mailActions from "@/lib/services/mail-actions";
import * as mailLabelAssignments from "@/lib/services/mail-label-assignments";
import * as mailFilterRules from "@/lib/services/mail-filter-rules";
import * as mailFilterRuns from "@/lib/services/mail-filter-runs";
import * as mailAttachments from "@/lib/services/mail-attachments";
import * as mailSync from "@/lib/services/mail-sync";
import { sendMail, MailItemNotFoundError } from "@/lib/services/mail-actions";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import {
  createMailLabelSchema,
  createMailFilterRuleSchema,
  updateMailLabelSchema,
  updateMailFilterRuleSchema,
} from "@/lib/validation/mail";
import {
  MAIL_FILTER_CONDITION_FIELDS,
  MAIL_FILTER_CONDITION_OPERATORS,
  MAIL_FILTER_MATCH_MODES,
} from "@/lib/mail-filter-types";
import { LABEL_PRESET_COLORS } from "@/lib/label-color";

const cursor = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous response's nextCursor");
const pageSize = z.number().int().min(1).max(100).optional();
const addresses = z.array(z.email()).default([]);

const labelColor = z
  .string()
  .describe(
    `A preset name (${LABEL_PRESET_COLORS.join(", ")}) or a hex value such as #616367.`,
  );

// The rule schemas carry conditional rules zod cannot express as a plain
// object, so the tools declare a flat shape and re-parse with the shared
// schema — same approach as tools/services.ts.
const filterCondition = z.object({
  field: z.enum(MAIL_FILTER_CONDITION_FIELDS),
  operator: z.enum(MAIL_FILTER_CONDITION_OPERATORS),
  value: z.string().min(1),
  isNegated: z.boolean(),
});

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

  // --- Organizing what has arrived ---

  defineTool({
    name: "mail_set_read",
    scope: "mail:write",
    title: "Mark a message read or unread",
    description:
      "Set one message's read flag. The change is pushed to the IMAP server as well as stored locally.",
    inputSchema: z.object({ id: z.string(), isRead: z.boolean() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await mailActions.setRead(args.id, ctx.workspaceId, args.isRead);
      return { id: args.id, isRead: args.isRead };
    },
  }),

  defineTool({
    name: "mail_move",
    scope: "mail:write",
    title: "Move a message to another folder",
    description:
      "Move one message into another folder of the same account. Folder ids come from mail_folders_list.",
    inputSchema: z.object({ id: z.string(), targetFolderId: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await mailActions.moveItem(args.id, ctx.workspaceId, args.targetFolderId);
      return { id: args.id, folderId: args.targetFolderId };
    },
  }),

  defineTool({
    name: "mail_delete",
    scope: "mail:write",
    title: "Delete a message",
    description:
      "Move one message to the account's Trash. Deleting from Trash — or from an account without one — is permanent; the answer says which happened.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => ({
      id: args.id,
      ...(await mailActions.deleteItem(args.id, ctx.workspaceId)),
    }),
  }),

  defineTool({
    name: "mail_label_assign",
    scope: "mail:write",
    title: "Put a label on a message",
    description:
      "Assign one workspace mail label to one message. Assigning a label it already carries changes nothing.",
    inputSchema: z.object({ id: z.string(), labelId: z.string() }),
    readOnly: false,
    handler: (args, ctx) =>
      mailLabelAssignments.assignLabel(ctx.workspaceId, args.id, args.labelId),
  }),

  defineTool({
    name: "mail_label_remove",
    scope: "mail:write",
    title: "Take a label off a message",
    description: "Remove one label from one message.",
    inputSchema: z.object({ id: z.string(), labelId: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await mailLabelAssignments.removeLabel(
        ctx.workspaceId,
        args.id,
        args.labelId,
      );
      return { id: args.id, labelId: args.labelId, removed: true };
    },
  }),

  // --- Labels ---
  // The label and rule tools pass a null operator: a token has no operator
  // behind it, so its own workspace scope is the authority.

  defineTool({
    name: "mail_label_create",
    scope: "mail:write",
    title: "Create a mail label",
    description:
      "Create a workspace mail label. Names are unique regardless of case.",
    inputSchema: z.object({ name: z.string().min(1), color: labelColor }),
    readOnly: false,
    handler: (args, ctx) =>
      mailLabels.createLabel(
        ctx.workspaceId,
        null,
        createMailLabelSchema.parse(args),
      ),
  }),

  defineTool({
    name: "mail_label_update",
    scope: "mail:write",
    title: "Update a mail label",
    description: "Rename, recolor or reposition one mail label.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: labelColor.optional(),
      position: z.number().int().min(0).optional(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      mailLabels.updateLabel(
        ctx.workspaceId,
        null,
        id,
        updateMailLabelSchema.parse(input),
      ),
  }),

  defineTool({
    name: "mail_label_delete",
    scope: "mail:write",
    title: "Delete a mail label",
    description:
      "Delete one mail label. A label a filter rule still points at cannot be removed — retarget or delete the rule first.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await mailLabels.deleteLabel(ctx.workspaceId, null, args.id);
      return { deleted: args.id };
    },
  }),

  // --- Filter rules ---

  defineTool({
    name: "mail_filter_rules_list",
    scope: "mail:read",
    title: "List an account's filter rules",
    description:
      "List one account's filter rules in evaluation order, each with the outcome of its most recent backfill run.",
    inputSchema: z.object({ accountId: z.string() }),
    readOnly: true,
    handler: (args, ctx) =>
      mailFilterRules.listMailFilterRules(
        ctx.workspaceId,
        null,
        args.accountId,
      ),
  }),

  defineTool({
    name: "mail_filter_rule_create",
    scope: "mail:write",
    title: "Create a mail filter rule",
    description:
      "Create a rule that labels incoming mail, and optionally marks it read or moves it. Give either `conditions` or the simple `fromAddress`/`subjectContains` pair. Set `applyToExistingMail` to also sweep the mail already in the account — that runs as a background job whose progress mail_filter_run_get reports.",
    inputSchema: z.object({
      accountId: z.string(),
      labelId: z.string().describe("The label the rule applies."),
      name: z.string().min(1),
      matchMode: z.enum(MAIL_FILTER_MATCH_MODES).optional(),
      conditions: z.array(filterCondition).optional(),
      fromAddress: z.string().optional(),
      subjectContains: z.string().optional(),
      setRead: z.boolean().nullish(),
      moveToFolderId: z.string().nullish(),
      applyToExistingMail: z.boolean().optional(),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      mailFilterRules.createMailFilterRule(
        ctx.workspaceId,
        null,
        createMailFilterRuleSchema.parse(args),
      ),
  }),

  defineTool({
    name: "mail_filter_rule_update",
    scope: "mail:write",
    title: "Update a mail filter rule",
    description:
      "Change a rule's predicate, actions, order or active flag. Omitted fields keep their current value.",
    inputSchema: z.object({
      id: z.string(),
      labelId: z.string().optional(),
      name: z.string().min(1).optional(),
      matchMode: z.enum(MAIL_FILTER_MATCH_MODES).optional(),
      conditions: z.array(filterCondition).optional(),
      fromAddress: z.string().optional(),
      subjectContains: z.string().optional(),
      setRead: z.boolean().nullish(),
      moveToFolderId: z.string().nullish(),
      isActive: z.boolean().optional(),
      position: z.number().int().min(0).optional(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      mailFilterRules.updateMailFilterRule(
        ctx.workspaceId,
        null,
        id,
        updateMailFilterRuleSchema.parse(input),
      ),
  }),

  defineTool({
    name: "mail_filter_rule_delete",
    scope: "mail:write",
    title: "Delete a mail filter rule",
    description:
      "Delete one rule. The labels it already applied stay on the messages that carry them.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await mailFilterRules.deleteMailFilterRule(
        ctx.workspaceId,
        null,
        args.id,
      );
      return { deleted: args.id };
    },
  }),

  defineTool({
    name: "mail_filter_run_get",
    scope: "mail:read",
    title: "Read a filter backfill run",
    description:
      "Read the status of a backfill run — how far it has swept the account's existing mail, and why it stopped if it failed.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: (args, ctx) =>
      mailFilterRuns.getMailFilterRun(ctx.workspaceId, null, args.id),
  }),

  defineTool({
    name: "mail_filter_run_retry",
    scope: "mail:write",
    title: "Retry a failed filter backfill run",
    description:
      "Queue a failed backfill run again. A run that is pending, running or already finished is refused.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: (args, ctx) =>
      mailFilterRuns.retryMailFilterRun(ctx.workspaceId, null, args.id),
  }),

  // --- Attachments and sync ---

  defineTool({
    name: "mail_attachment_get",
    scope: "mail:read",
    title: "Read an attachment",
    description:
      "Fetch one attachment's bytes, base64-encoded. Attachment ids come from mail_get. An attachment above the workspace size ceiling is refused rather than truncated.",
    inputSchema: z.object({ id: z.string(), attachmentId: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const attachment = await mailAttachments.getAttachmentContent(
        args.id,
        args.attachmentId,
        ctx.workspaceId,
      );
      return {
        filename: attachment.filename,
        contentType: attachment.contentType,
        contentBase64: attachment.content.toString("base64"),
      };
    },
  }),

  defineTool({
    name: "mail_sync_start",
    scope: "mail:write",
    title: "Sync a mail account now",
    description:
      "Fetch new mail for one IMAP account outside its schedule. Refused while a sync of the same account is already running. Creating, editing and deleting accounts stays an operator action in the dashboard — this tool never sees a password.",
    inputSchema: z.object({ accountId: z.string() }),
    readOnly: false,
    handler: (args, ctx) =>
      mailSync.syncAccount(args.accountId, ctx.workspaceId),
  }),
];
