import { describe, expect, it, vi } from "vitest";

import type {
  MailAccountDto,
  MailDetailDto,
  MailDraftDto,
  MailFilterRuleDto,
  MailFolderDto,
  MailLabelDto,
  MailListItemDto,
} from "@/components/mail/api";
import {
  createMailTools,
  type MailToolDeps,
} from "@/components/mail/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const NOW = "2026-01-01T00:00:00.000Z";

function makeAccount(overrides: Partial<MailAccountDto> = {}): MailAccountDto {
  return {
    id: "account-1",
    kind: "IMAP",
    mode: "REAL",
    name: "Support",
    email: "support@example.com",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecurity: "SSL",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpSecurity: "STARTTLS",
    username: "support",
    maskedHint: "••••",
    isValid: true,
    lastCheckedAt: NOW,
    isActive: true,
    isDefault: false,
    syncStatus: "IDLE",
    syncError: null,
    lastSyncAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<MailFolderDto> = {}): MailFolderDto {
  return {
    id: "folder-inbox",
    path: "INBOX",
    name: "Inbox",
    specialUse: "INBOX",
    position: 0,
    unreadCount: 3,
    ...overrides,
  };
}

function makeItem(overrides: Partial<MailListItemDto> = {}): MailListItemDto {
  return {
    id: "mail-1",
    from: "alice@example.com",
    fromName: "Alice",
    subject: "Disk almost full",
    snippet: "The edge node is at 94%.",
    isRead: false,
    isAnswered: false,
    isFlagged: false,
    hasAttachments: false,
    receivedAt: NOW,
    accountId: "account-1",
    folderId: "folder-inbox",
    labels: [],
    ...overrides,
  };
}

function makeLabel(overrides: Partial<MailLabelDto> = {}): MailLabelDto {
  return {
    id: "label-1",
    name: "Incidents",
    color: "RED",
    position: 0,
    messageCount: 4,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<MailDetailDto> = {}): MailDetailDto {
  return {
    id: "mail-1",
    accountId: "account-1",
    folderId: "folder-inbox",
    accountKind: "IMAP",
    from: "alice@example.com",
    fromName: "Alice",
    to: [{ name: "Support", address: "support@example.com" }],
    cc: [],
    bcc: [],
    subject: "Disk almost full",
    snippet: "The edge node is at 94%.",
    bodyText: "The edge node is at 94%.",
    bodyHtml: null,
    draftReplyToId: null,
    draftForwardOfId: null,
    isRead: false,
    isAnswered: false,
    isFlagged: false,
    hasAttachments: false,
    receivedAt: NOW,
    attachments: [],
    labels: [],
    ...overrides,
  };
}

function makeRule(
  overrides: Partial<MailFilterRuleDto> = {},
): MailFilterRuleDto {
  return {
    id: "rule-1",
    accountId: "account-1",
    labelId: "label-1",
    name: "Alerts from monitoring",
    fromAddress: "alerts@example.com",
    subjectContains: null,
    isActive: true,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    label: { name: "Incidents", color: "RED" },
    latestRun: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<MailDraftDto> = {}): MailDraftDto {
  return {
    id: "draft-1",
    accountId: "account-1",
    to: ["alice@example.com"],
    cc: [],
    bcc: [],
    subject: "Re: Disk almost full",
    bodyText: "On it.",
    bodyHtml: "",
    inReplyToId: null,
    forwardOfId: null,
    updatedAt: NOW,
    attachments: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<MailToolDeps> = {}): MailToolDeps {
  return {
    fetchMailAccounts: vi
      .fn()
      .mockResolvedValue([
        makeAccount({ id: "account-1" }),
        makeAccount({ id: "account-2", name: "Billing", isDefault: true }),
      ]),
    fetchFolders: vi
      .fn()
      .mockResolvedValue([
        makeFolder({ id: "folder-sent", name: "Sent", specialUse: "SENT" }),
        makeFolder(),
      ]),
    fetchMail: vi
      .fn()
      .mockResolvedValue({ items: [makeItem()], nextCursor: null }),
    fetchMailById: vi.fn().mockResolvedValue(makeDetail()),
    fetchMailLabels: vi.fn().mockResolvedValue([makeLabel()]),
    fetchMailFilterRules: vi.fn().mockResolvedValue([makeRule()]),
    patchMailItem: vi.fn().mockResolvedValue({ id: "mail-1", isRead: true }),
    moveMailItem: vi
      .fn()
      .mockResolvedValue({ id: "mail-1", folderId: "folder-sent" }),
    deleteMailItem: vi.fn().mockResolvedValue({ status: "trashed" }),
    assignMailLabel: vi.fn().mockResolvedValue(makeLabel()),
    removeMailLabel: vi.fn().mockResolvedValue(undefined),
    sendMail: vi.fn().mockResolvedValue({ id: "mail-sent-1" }),
    saveMailDraft: vi.fn().mockResolvedValue(makeDraft()),
    syncAccount: vi
      .fn()
      .mockResolvedValue({ status: "synced", folders: 5, newMessages: 2 }),
    refresh: vi.fn(),
    ...overrides,
  };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name} was registered.`);
  return tool;
}

const EXPECTED_TOOL_NAMES = [
  "mail_accounts_list",
  "mail_folders_list",
  "mail_labels_list",
  "mail_search",
  "mail_get",
  "mail_filter_rules_list",
  "mail_set_read",
  "mail_move",
  "mail_delete",
  "mail_label_assign",
  "mail_label_remove",
  "mail_draft_save",
  "mail_send",
  "mail_sync_start",
];

const READ_ONLY_TOOL_NAMES = [
  "mail_accounts_list",
  "mail_folders_list",
  "mail_labels_list",
  "mail_search",
  "mail_get",
  "mail_filter_rules_list",
];

describe("createMailTools registration", () => {
  it("registers exactly the expected tool names", () => {
    const tools = createMailTools(makeDeps());

    expect(tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("gives every tool a non-empty title and description", () => {
    for (const tool of createMailTools(makeDeps())) {
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500);
    }
  });

  it("marks the reads read-only and the mutations not", () => {
    for (const tool of createMailTools(makeDeps())) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(
        READ_ONLY_TOOL_NAMES.includes(tool.name),
      );
    }
  });

  it("flags only the tools carrying third-party text as untrusted", () => {
    const untrusted = createMailTools(makeDeps())
      .filter((tool) => tool.annotations.untrustedContentHint)
      .map((tool) => tool.name);

    expect(untrusted).toEqual(["mail_search", "mail_get"]);
  });
});

describe("mail_accounts_list", () => {
  it("returns a compact row per account", async () => {
    const tools = createMailTools(makeDeps());

    const result = await toolNamed(tools, "mail_accounts_list").execute({});

    expect(expectToolJson(result)).toEqual([
      {
        id: "account-1",
        name: "Support",
        email: "support@example.com",
        kind: "IMAP",
        isDefault: false,
        isActive: true,
        syncStatus: "IDLE",
      },
      {
        id: "account-2",
        name: "Billing",
        email: "support@example.com",
        kind: "IMAP",
        isDefault: true,
        isActive: true,
        syncStatus: "IDLE",
      },
    ]);
  });
});

describe("mail_folders_list", () => {
  it("passes the account id through and returns id plus name per folder", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_folders_list").execute({
      accountId: "account-1",
    });

    expect(deps.fetchFolders).toHaveBeenCalledWith("account-1");
    expect(expectToolJson(result)).toEqual([
      {
        id: "folder-sent",
        name: "Sent",
        path: "INBOX",
        specialUse: "SENT",
        unreadCount: 3,
      },
      {
        id: "folder-inbox",
        name: "Inbox",
        path: "INBOX",
        specialUse: "INBOX",
        unreadCount: 3,
      },
    ]);
  });
});

describe("mail_labels_list", () => {
  it("returns each label's id, name and count", async () => {
    const tools = createMailTools(makeDeps());

    const result = await toolNamed(tools, "mail_labels_list").execute({});

    expect(expectToolJson(result)).toEqual([
      { id: "label-1", name: "Incidents", color: "RED", messageCount: 4 },
    ]);
  });
});

describe("mail_search", () => {
  it("bootstraps the default account and its INBOX when both are omitted", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({
      query: "disk",
    });

    expect(deps.fetchFolders).toHaveBeenCalledWith("account-2");
    expect(deps.fetchMail).toHaveBeenCalledWith({
      accountId: "account-2",
      folderId: "folder-inbox",
      labelId: undefined,
      unread: undefined,
      query: "disk",
      sort: undefined,
      cursor: undefined,
      from: undefined,
    });
    expect(expectToolJson(result)).toMatchObject({
      accountId: "account-2",
      accountName: "Billing",
      folderId: "folder-inbox",
      folderName: "Inbox",
      count: 1,
    });
  });

  it("falls back to the first non-webhook account when none is flagged default", async () => {
    const deps = makeDeps({
      fetchMailAccounts: vi
        .fn()
        .mockResolvedValue([
          makeAccount({ id: "account-hook", kind: "WEBHOOK" }),
          makeAccount({ id: "account-imap", name: "Ops" }),
        ]),
    });
    const tools = createMailTools(deps);

    await toolNamed(tools, "mail_search").execute({});

    expect(deps.fetchFolders).toHaveBeenCalledWith("account-imap");
  });

  it("passes a supplied account and folder through without substituting", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({
      accountId: "account-1",
      folderId: "folder-sent",
      from: "alice@example.com",
      unreadOnly: true,
      sort: "asc",
      cursor: "cur-1",
      labelId: "label-1",
    });

    expect(deps.fetchFolders).toHaveBeenCalledWith("account-1");
    expect(deps.fetchMail).toHaveBeenCalledWith({
      accountId: "account-1",
      folderId: "folder-sent",
      labelId: "label-1",
      unread: true,
      query: undefined,
      sort: "asc",
      cursor: "cur-1",
      from: "alice@example.com",
    });
    expect(expectToolJson(result)).toMatchObject({
      accountId: "account-1",
      folderId: "folder-sent",
      folderName: "Sent",
    });
  });

  it("returns metadata only, never the message body", async () => {
    const tools = createMailTools(makeDeps());

    const result = await toolNamed(tools, "mail_search").execute({});
    const { messages } = expectToolJson<{
      messages: Record<string, unknown>[];
    }>(result);

    expect(Object.keys(messages[0])).toEqual([
      "id",
      "subject",
      "from",
      "fromName",
      "isRead",
      "hasAttachments",
      "receivedAt",
    ]);
  });

  it("trims the page to the limit and withholds the now-wrong cursor", async () => {
    const deps = makeDeps({
      fetchMail: vi.fn().mockResolvedValue({
        items: [
          makeItem({ id: "mail-1" }),
          makeItem({ id: "mail-2" }),
          makeItem({ id: "mail-3" }),
        ],
        nextCursor: "cur-next",
      }),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({ limit: 2 });

    expect(expectToolJson(result)).toMatchObject({
      count: 2,
      truncated: true,
      nextCursor: null,
    });
  });

  it("errors when the workspace has no mail account at all", async () => {
    const deps = makeDeps({
      fetchMailAccounts: vi.fn().mockResolvedValue([]),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({});

    expect(expectToolError(result)).toContain("no mail account");
    expect(deps.fetchMail).not.toHaveBeenCalled();
  });

  it("errors when the supplied account id is unknown", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({
      accountId: "account-gone",
    });

    expect(expectToolError(result)).toContain("mail_accounts_list");
    expect(deps.fetchMail).not.toHaveBeenCalled();
  });

  it("errors when the supplied folder id is not in the account", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({
      folderId: "folder-gone",
    });

    expect(expectToolError(result)).toContain("mail_folders_list");
    expect(deps.fetchMail).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting fetch as an error result carrying the message", async () => {
    const deps = makeDeps({
      fetchMail: vi.fn().mockRejectedValue(new Error("Mail server timed out.")),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_search").execute({});

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Mail server timed out.");
  });
});

describe("mail_get", () => {
  it("returns headers plus the plain-text body", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_get").execute({ id: "mail-1" });

    expect(deps.fetchMailById).toHaveBeenCalledWith("mail-1");
    expect(expectToolJson(result)).toMatchObject({
      id: "mail-1",
      subject: "Disk almost full",
      from: "alice@example.com",
      to: ["support@example.com"],
      bodyText: "The edge node is at 94%.",
      bodyTruncated: false,
    });
  });

  it("trims a long body and says so", async () => {
    const deps = makeDeps({
      fetchMailById: vi
        .fn()
        .mockResolvedValue(makeDetail({ bodyText: "x".repeat(5000) })),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_get").execute({ id: "mail-1" });
    const payload = expectToolJson<{
      bodyText: string;
      bodyTruncated: boolean;
    }>(result);

    expect(payload.bodyText).toHaveLength(1201);
    expect(payload.bodyTruncated).toBe(true);
  });
});

describe("mail_filter_rules_list", () => {
  it("returns each rule with the label it applies", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_filter_rules_list").execute({
      accountId: "account-1",
    });

    expect(deps.fetchMailFilterRules).toHaveBeenCalledWith("account-1");
    expect(expectToolJson(result)).toEqual([
      {
        id: "rule-1",
        name: "Alerts from monitoring",
        labelId: "label-1",
        labelName: "Incidents",
        isActive: true,
        position: 0,
      },
    ]);
  });
});

describe("mail mutations", () => {
  it("mail_set_read forwards the flag and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_set_read").execute({
      id: "mail-1",
      isRead: true,
    });

    expect(deps.patchMailItem).toHaveBeenCalledWith("mail-1", { isRead: true });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({ id: "mail-1", isRead: true });
  });

  it("mail_move forwards the destination folder and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_move").execute({
      id: "mail-1",
      targetFolderId: "folder-sent",
    });

    expect(deps.moveMailItem).toHaveBeenCalledWith("mail-1", "folder-sent");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      id: "mail-1",
      folderId: "folder-sent",
    });
  });

  it("mail_delete reports whether the message was trashed or erased", async () => {
    const deps = makeDeps({
      deleteMailItem: vi.fn().mockResolvedValue({ status: "deleted" }),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_delete").execute({
      id: "mail-1",
    });

    expect(deps.deleteMailItem).toHaveBeenCalledWith("mail-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      id: "mail-1",
      status: "deleted",
    });
  });

  it("mail_label_assign forwards both ids and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_label_assign").execute({
      id: "mail-1",
      labelId: "label-1",
    });

    expect(deps.assignMailLabel).toHaveBeenCalledWith("mail-1", "label-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      id: "mail-1",
      labelId: "label-1",
      labelName: "Incidents",
    });
  });

  it("mail_label_remove forwards both ids and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_label_remove").execute({
      id: "mail-1",
      labelId: "label-1",
    });

    expect(deps.removeMailLabel).toHaveBeenCalledWith("mail-1", "label-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      id: "mail-1",
      labelId: "label-1",
      removed: true,
    });
  });

  it("mail_draft_save supplies the empty compose defaults and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_draft_save").execute({
      accountId: "account-1",
      to: ["alice@example.com"],
      subject: "Re: Disk almost full",
    });

    expect(deps.saveMailDraft).toHaveBeenCalledWith({
      accountId: "account-1",
      to: ["alice@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Disk almost full",
      bodyText: "",
      bodyHtml: "",
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      draftId: "draft-1",
      accountId: "account-1",
      to: ["alice@example.com"],
      subject: "Re: Disk almost full",
      updatedAt: NOW,
    });
  });

  it("mail_send forwards the whole compose payload and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_send").execute({
      accountId: "account-1",
      to: ["alice@example.com"],
      cc: ["ops@example.com"],
      subject: "Re: Disk almost full",
      bodyText: "On it.",
      inReplyToId: "mail-1",
    });

    expect(deps.sendMail).toHaveBeenCalledWith({
      accountId: "account-1",
      to: ["alice@example.com"],
      cc: ["ops@example.com"],
      bcc: [],
      subject: "Re: Disk almost full",
      bodyText: "On it.",
      bodyHtml: "",
      inReplyToId: "mail-1",
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({ id: "mail-sent-1", sent: true });
  });

  it("mail_send rejects a malformed recipient before calling the api", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_send").execute({
      accountId: "account-1",
      to: ["not-an-address"],
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("mail_sync_start reports the sync counters and refreshes", async () => {
    const deps = makeDeps();
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_sync_start").execute({
      accountId: "account-1",
    });

    expect(deps.syncAccount).toHaveBeenCalledWith("account-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      accountId: "account-1",
      folders: 5,
      newMessages: 2,
    });
  });

  it("surfaces a rejecting mutation as an error result and skips refresh", async () => {
    const deps = makeDeps({
      syncAccount: vi.fn().mockRejectedValue(new Error("SYNC_IN_PROGRESS")),
    });
    const tools = createMailTools(deps);

    const result = await toolNamed(tools, "mail_sync_start").execute({
      accountId: "account-1",
    });

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("SYNC_IN_PROGRESS");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
