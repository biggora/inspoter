import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type {
  FetchMailParams,
  FetchMailResult,
  MailAccountDto,
  MailDetailDto,
  MailDraftDto,
  MailFilterRuleDto,
  MailFolderDto,
  MailLabelDto,
  SaveMailDraftInput,
  SendMailInput,
  SyncResultDto,
} from "@/components/mail/api";

// WebMCP tools for Mail. Registered from the dashboard layout (see
// src/components/shell/web-mcp-global-tools.tsx) rather than from the mail
// page, so they need no live page state — only the /api/mail client.
//
// Tool names deliberately match the server-side MCP catalog in
// src/lib/mcp/tools/mail.ts. The two registries are separate, and matching
// names keep the two surfaces legible to anyone reading both.
//
// Every id parameter names the tool it comes from: this layer never resolves
// free text to a record, with one exception the API forces — `mail_search`
// bootstraps a default account and INBOX folder, because `fetchMail` requires
// both and an agent asked to "find mail from X" has neither. The resolved
// names travel back in the result so the agent can see what was searched.

/**
 * Every client API call the mail tools make, injected rather than imported so
 * the factory unit-tests without React or `fetch`. Each member matches the
 * signature of the same-named export in `src/components/mail/api.ts`.
 */
export interface MailToolDeps {
  fetchMailAccounts: () => Promise<MailAccountDto[]>;
  fetchFolders: (accountId: string) => Promise<MailFolderDto[]>;
  fetchMail: (params: FetchMailParams) => Promise<FetchMailResult>;
  fetchMailById: (id: string) => Promise<MailDetailDto>;
  fetchMailLabels: (scope?: {
    accountId: string;
    folderId: string;
  }) => Promise<MailLabelDto[]>;
  fetchMailFilterRules: (accountId: string) => Promise<MailFilterRuleDto[]>;
  patchMailItem: (
    id: string,
    input: { isRead: boolean },
  ) => Promise<{ id: string; isRead: boolean }>;
  moveMailItem: (
    id: string,
    targetFolderId: string,
  ) => Promise<{ id: string; folderId: string }>;
  deleteMailItem: (id: string) => Promise<{ status: "trashed" | "deleted" }>;
  assignMailLabel: (mailId: string, labelId: string) => Promise<MailLabelDto>;
  removeMailLabel: (mailId: string, labelId: string) => Promise<void>;
  sendMail: (input: SendMailInput) => Promise<{ id: string | null }>;
  saveMailDraft: (input: SaveMailDraftInput) => Promise<MailDraftDto>;
  syncAccount: (accountId: string) => Promise<SyncResultDto>;
  /** Re-runs the page fetches so any visible mail UI reflects a mutation. */
  refresh: () => void;
}

// --- output budget ---
// A single tool result should stay near ~1500 characters, so subjects and
// bodies are trimmed and lists are capped rather than returned whole.

const MAX_SUBJECT_LENGTH = 90;
const MAX_BODY_LENGTH = 1200;
const MAX_ADDRESSES = 10;
const MAX_LABELS = 25;
const MAX_FILTER_RULES = 25;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// --- shared scope resolution ---

function pickAccount(
  accounts: MailAccountDto[],
  accountId: string | undefined,
): MailAccountDto {
  if (accounts.length === 0) {
    throw new Error(
      "This workspace has no mail account. Add one in Settings → Mail first.",
    );
  }
  if (accountId === undefined) {
    // Same preference order the mail page uses: the flagged default, then any
    // account that is not inbound-only, then whatever is first.
    return (
      accounts.find((account) => account.isDefault) ??
      accounts.find((account) => account.kind !== "WEBHOOK") ??
      accounts[0]
    );
  }
  const found = accounts.find((account) => account.id === accountId);
  if (!found) {
    throw new Error(
      `No mail account with id "${accountId}". Call mail_accounts_list for the ids.`,
    );
  }
  return found;
}

function pickFolder(
  folders: MailFolderDto[],
  folderId: string | undefined,
  accountName: string,
): MailFolderDto {
  if (folders.length === 0) {
    throw new Error(
      `Account "${accountName}" has no folders yet. Run mail_sync_start first.`,
    );
  }
  if (folderId === undefined) {
    return (
      folders.find((folder) => folder.specialUse === "INBOX") ?? folders[0]
    );
  }
  const found = folders.find((folder) => folder.id === folderId);
  if (!found) {
    throw new Error(
      `No folder with id "${folderId}" in account "${accountName}". Call mail_folders_list for the ids.`,
    );
  }
  return found;
}

// --- mail_accounts_list ---

function createAccountsListTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_accounts_list",
    title: "List mail accounts",
    description:
      "Lists the workspace's mail accounts with their ids. Only accounts of kind IMAP can send mail or hold drafts; a WEBHOOK account is inbound-only. The account flagged isDefault is the one mail_search uses when none is given.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    async handler() {
      const accounts = await deps.fetchMailAccounts();
      return accounts.map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        kind: account.kind,
        isDefault: account.isDefault,
        isActive: account.isActive,
        syncStatus: account.syncStatus,
      }));
    },
  });
}

// --- mail_folders_list ---

const foldersListInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("Mail account id from mail_accounts_list"),
  })
  .strict();

function createFoldersListTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_folders_list",
    title: "List mail folders",
    description:
      "Lists one account's folders with their ids, names, unread counts and special-use role (INBOX, SENT, DRAFTS, TRASH, JUNK, ARCHIVE, OTHER). Folder ids from here are what mail_search and mail_move take.",
    inputSchema: foldersListInputSchema,
    readOnly: true,
    async handler({ accountId }) {
      const folders = await deps.fetchFolders(accountId);
      return folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        specialUse: folder.specialUse,
        unreadCount: folder.unreadCount,
      }));
    },
  });
}

// --- mail_labels_list ---

function createLabelsListTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_labels_list",
    title: "List mail labels",
    description:
      "Lists the workspace's mail labels with their ids and message counts. Label ids from here are what mail_label_assign, mail_label_remove and mail_search take.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    async handler() {
      const labels = await deps.fetchMailLabels();
      return labels.slice(0, MAX_LABELS).map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        messageCount: label.messageCount ?? null,
      }));
    },
  });
}

// --- mail_search ---

const searchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Text matched against subject, sender address and sender name"),
    from: z.string().min(1).optional().describe("Exact sender email address"),
    accountId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Mail account id from mail_accounts_list; omit for the default account",
      ),
    folderId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Folder id from mail_folders_list; omit for the account's INBOX",
      ),
    labelId: z
      .string()
      .min(1)
      .optional()
      .describe("Label id from mail_labels_list, to keep only labelled mail"),
    unreadOnly: z
      .boolean()
      .optional()
      .describe("Return only unread messages when true"),
    sort: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Order by received date; defaults to newest first"),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("nextCursor from a previous mail_search result"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of messages to return"),
  })
  .strict();

function createSearchTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_search",
    title: "Search mail",
    description:
      "Searches one mail folder and returns message metadata only — never the body, which mail_get supplies. Omit accountId to use the default account and folderId to use its INBOX; the account and folder actually searched come back in the result.",
    inputSchema: searchInputSchema,
    readOnly: true,
    // Subjects and sender names are written by whoever sent the mail.
    untrustedOutput: true,
    async handler({
      query,
      from,
      accountId,
      folderId,
      labelId,
      unreadOnly,
      sort,
      cursor,
      limit,
    }) {
      const account = pickAccount(await deps.fetchMailAccounts(), accountId);
      const folder = pickFolder(
        await deps.fetchFolders(account.id),
        folderId,
        account.name,
      );

      const result = await deps.fetchMail({
        accountId: account.id,
        folderId: folder.id,
        labelId,
        unread: unreadOnly,
        query,
        sort,
        cursor,
        from,
      });

      // The route pages server-side; `limit` trims that page further so a
      // single result stays inside the output budget. A trimmed page makes the
      // server's cursor wrong — it would skip the messages left behind — so it
      // is withheld and `truncated` says why.
      const messages = result.items.slice(0, limit);
      const truncated = messages.length < result.items.length;
      return {
        accountId: account.id,
        accountName: account.name,
        folderId: folder.id,
        folderName: folder.name,
        count: messages.length,
        truncated,
        nextCursor: truncated ? null : result.nextCursor,
        messages: messages.map((item) => ({
          id: item.id,
          subject: truncate(item.subject, MAX_SUBJECT_LENGTH),
          from: item.from,
          fromName: item.fromName,
          isRead: item.isRead,
          hasAttachments: item.hasAttachments,
          receivedAt: item.receivedAt,
        })),
      };
    },
  });
}

// --- mail_get ---

const getInputSchema = z
  .object({
    id: z.string().min(1).describe("Message id from mail_search"),
  })
  .strict();

function createGetTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_get",
    title: "Read a message",
    description:
      "Reads one message: headers, label and attachment metadata, and the plain-text body, trimmed if it is long. Attachment bytes are never included.",
    inputSchema: getInputSchema,
    readOnly: true,
    // The body, subject and sender name are third-party-authored text.
    untrustedOutput: true,
    async handler({ id }) {
      const item = await deps.fetchMailById(id);
      const bodyText = truncate(item.bodyText, MAX_BODY_LENGTH);
      return {
        id: item.id,
        accountId: item.accountId,
        folderId: item.folderId,
        subject: truncate(item.subject, MAX_SUBJECT_LENGTH),
        from: item.from,
        fromName: item.fromName,
        to: item.to.slice(0, MAX_ADDRESSES).map((address) => address.address),
        cc: item.cc.slice(0, MAX_ADDRESSES).map((address) => address.address),
        isRead: item.isRead,
        receivedAt: item.receivedAt,
        labels: item.labels.map((label) => ({
          id: label.id,
          name: label.name,
        })),
        attachments: item.attachments.map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          sizeBytes: attachment.sizeBytes,
        })),
        bodyText,
        bodyTruncated: bodyText.length < item.bodyText.length,
      };
    },
  });
}

// --- mail_filter_rules_list ---

const filterRulesListInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("Mail account id from mail_accounts_list"),
  })
  .strict();

function createFilterRulesListTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_filter_rules_list",
    title: "List mail filter rules",
    description:
      "Lists one account's filter rules in evaluation order, each with the label it applies. Creating and editing rules stays an operator action in the dashboard.",
    inputSchema: filterRulesListInputSchema,
    readOnly: true,
    async handler({ accountId }) {
      const rules = await deps.fetchMailFilterRules(accountId);
      return rules.slice(0, MAX_FILTER_RULES).map((rule) => ({
        id: rule.id,
        name: rule.name,
        labelId: rule.labelId,
        labelName: rule.label.name,
        isActive: rule.isActive,
        position: rule.position,
      }));
    },
  });
}

// --- mail_set_read ---

const setReadInputSchema = z
  .object({
    id: z.string().min(1).describe("Message id from mail_search"),
    isRead: z.boolean().describe("True to mark read, false to mark unread"),
  })
  .strict();

function createSetReadTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_set_read",
    title: "Mark a message read or unread",
    description:
      "Sets one message's read flag. The change is pushed to the mail server as well as stored locally.",
    inputSchema: setReadInputSchema,
    readOnly: false,
    async handler({ id, isRead }) {
      const result = await deps.patchMailItem(id, { isRead });
      deps.refresh();
      return { id: result.id, isRead: result.isRead };
    },
  });
}

// --- mail_move ---

const moveInputSchema = z
  .object({
    id: z.string().min(1).describe("Message id from mail_search"),
    targetFolderId: z
      .string()
      .min(1)
      .describe("Destination folder id from mail_folders_list"),
  })
  .strict();

function createMoveTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_move",
    title: "Move a message",
    description:
      "Moves one message into another folder of the same account. The destination must belong to the message's own account.",
    inputSchema: moveInputSchema,
    readOnly: false,
    async handler({ id, targetFolderId }) {
      const result = await deps.moveMailItem(id, targetFolderId);
      deps.refresh();
      return { id: result.id, folderId: result.folderId };
    },
  });
}

// --- mail_delete ---

const deleteInputSchema = z
  .object({
    id: z.string().min(1).describe("Message id from mail_search"),
  })
  .strict();

function createDeleteTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_delete",
    title: "Delete a message",
    description:
      "Moves one message to the account's Trash. Deleting from Trash — or from an account without one — is permanent; the answer says which happened.",
    inputSchema: deleteInputSchema,
    readOnly: false,
    async handler({ id }) {
      const result = await deps.deleteMailItem(id);
      deps.refresh();
      return { id, status: result.status };
    },
  });
}

// --- mail_label_assign / mail_label_remove ---

const labelInputSchema = z
  .object({
    id: z.string().min(1).describe("Message id from mail_search"),
    labelId: z.string().min(1).describe("Label id from mail_labels_list"),
  })
  .strict();

function createLabelAssignTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_label_assign",
    title: "Put a label on a message",
    description:
      "Assigns one workspace mail label to one message. Assigning a label the message already carries changes nothing.",
    inputSchema: labelInputSchema,
    readOnly: false,
    async handler({ id, labelId }) {
      const label = await deps.assignMailLabel(id, labelId);
      deps.refresh();
      return { id, labelId: label.id, labelName: label.name };
    },
  });
}

function createLabelRemoveTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_label_remove",
    title: "Take a label off a message",
    description: "Removes one label from one message.",
    inputSchema: labelInputSchema,
    readOnly: false,
    async handler({ id, labelId }) {
      await deps.removeMailLabel(id, labelId);
      deps.refresh();
      return { id, labelId, removed: true };
    },
  });
}

// --- compose (mail_draft_save / mail_send) ---

const addresses = z.array(z.email()).max(MAX_ADDRESSES);

const composeFields = {
  accountId: z
    .string()
    .min(1)
    .describe("Sending IMAP account id from mail_accounts_list"),
  cc: addresses.default([]).describe("Carbon-copy addresses"),
  bcc: addresses.default([]).describe("Blind carbon-copy addresses"),
  subject: z.string().max(500).default("").describe("Subject line"),
  bodyText: z.string().max(20000).default("").describe("Plain-text body"),
  bodyHtml: z
    .string()
    .max(50000)
    .default("")
    .describe("HTML body; leave empty to send text only"),
  inReplyToId: z
    .string()
    .min(1)
    .optional()
    .describe("Id from mail_search of the message being replied to"),
  forwardOfId: z
    .string()
    .min(1)
    .optional()
    .describe("Id from mail_search of the message being forwarded"),
};

const draftSaveInputSchema = z
  .object({
    draftId: z
      .string()
      .min(1)
      .optional()
      .describe("Id of an existing draft to overwrite; omit to create one"),
    to: addresses.default([]).describe("Recipient addresses"),
    ...composeFields,
  })
  .strict();

function createDraftSaveTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_draft_save",
    title: "Create or update a draft",
    description:
      "Saves a draft in the account's Drafts folder without sending it. Omit draftId to create a new draft, pass it to overwrite an existing one.",
    inputSchema: draftSaveInputSchema,
    readOnly: false,
    async handler(input) {
      const draft = await deps.saveMailDraft(input);
      deps.refresh();
      return {
        draftId: draft.id,
        accountId: draft.accountId,
        to: draft.to,
        subject: truncate(draft.subject, MAX_SUBJECT_LENGTH),
        updatedAt: draft.updatedAt,
      };
    },
  });
}

const sendInputSchema = z
  .object({
    draftId: z
      .string()
      .min(1)
      .optional()
      .describe("Id of an existing draft to send instead of a new message"),
    to: addresses.min(1).describe("Recipient addresses; at least one"),
    ...composeFields,
  })
  .strict();

function createSendTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_send",
    title: "Send mail",
    description:
      "Sends a message over the account's SMTP transport and files a copy in Sent. Pass draftId to send an existing draft. This cannot be undone — confirm the recipients and body with the operator first.",
    inputSchema: sendInputSchema,
    readOnly: false,
    async handler(input) {
      const result = await deps.sendMail(input);
      deps.refresh();
      return { id: result.id, sent: true };
    },
  });
}

// --- mail_sync_start ---

const syncStartInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("Mail account id from mail_accounts_list"),
  })
  .strict();

function createSyncStartTool(deps: MailToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "mail_sync_start",
    title: "Sync a mail account now",
    description:
      "Fetches new mail for one IMAP account outside its schedule, and is refused while a sync of the same account is already running. Adding and editing accounts stays an operator action — this tool never sees a password.",
    inputSchema: syncStartInputSchema,
    readOnly: false,
    async handler({ accountId }) {
      const result = await deps.syncAccount(accountId);
      deps.refresh();
      return {
        accountId,
        folders: result.folders,
        newMessages: result.newMessages,
      };
    },
  });
}

/** Every mail WebMCP tool, in the order an agent would discover them. */
export function createMailTools(deps: MailToolDeps): WebMcpTool[] {
  return [
    createAccountsListTool(deps),
    createFoldersListTool(deps),
    createLabelsListTool(deps),
    createSearchTool(deps),
    createGetTool(deps),
    createFilterRulesListTool(deps),
    createSetReadTool(deps),
    createMoveTool(deps),
    createDeleteTool(deps),
    createLabelAssignTool(deps),
    createLabelRemoveTool(deps),
    createDraftSaveTool(deps),
    createSendTool(deps),
    createSyncStartTool(deps),
  ];
}
