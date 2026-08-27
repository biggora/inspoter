// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterRuleDialog } from "@/components/mail/filter-rule-dialog";
import { FilterRulesDialog } from "@/components/mail/filter-rules-dialog";
import { LabelChip } from "@/components/mail/label-chip";
import { LabelColorField } from "@/components/mail/label-color-field";
import { ManageLabelsDialog } from "@/components/mail/manage-labels-dialog";
import { MailClientView } from "@/components/mail/mail-client-view";
import { MailSidebar } from "@/components/mail/mail-sidebar";
import { MessageLabelPicker } from "@/components/mail/message-label-picker";
import { MessageList } from "@/components/mail/message-list";
import {
  ApiError,
  type MailAccountDto,
  type MailDetailDto,
  type MailFolderDto,
  type MailListItemDto,
} from "@/components/mail/api";
import { renderWithIntl } from "../../test-utils";

const apiMocks = vi.hoisted(() => ({
  createExactSenderRule: vi.fn(),
  createMailFilterRule: vi.fn(),
  createMailLabel: vi.fn(),
  deleteMailLabel: vi.fn(),
  deleteMailFilterRule: vi.fn(),
  assignMailLabel: vi.fn(),
  deleteMailItem: vi.fn(),
  fetchFolders: vi.fn(),
  fetchMail: vi.fn(),
  fetchMailAccounts: vi.fn(),
  fetchMailById: vi.fn(),
  fetchMailLabels: vi.fn(),
  fetchMailFilterRules: vi.fn(),
  fetchMailFilterRun: vi.fn(),
  moveMailItem: vi.fn(),
  patchMailItem: vi.fn(),
  patchMailLabel: vi.fn(),
  patchMailFilterRule: vi.fn(),
  removeMailLabel: vi.fn(),
  retryMailFilterRun: vi.fn(),
  syncAccount: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/components/mail/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;

    constructor(message: string, fieldErrors?: Record<string, string>) {
      super(message);
      this.fieldErrors = fieldErrors;
    }
  }
  return { ApiError, SYNC_IN_PROGRESS: "SYNC_IN_PROGRESS", ...apiMocks };
});

const ITEM: MailListItemDto = {
  id: "message-1",
  from: "sender@example.com",
  fromName: "Build Bot",
  subject: "Deployment complete",
  snippet: "The release is live.",
  isRead: false,
  isAnswered: false,
  isFlagged: false,
  hasAttachments: false,
  receivedAt: "invalid-test-date",
  accountId: "account-1",
  folderId: "folder-1",
  labels: [
    { id: "label-1", name: "Production alerts", color: "GREEN" },
    { id: "label-2", name: "Deployments", color: "BLUE" },
    { id: "label-3", name: "Automation", color: "VIOLET" },
  ],
};

const DETAIL: MailDetailDto = {
  ...ITEM,
  accountKind: "WEBHOOK",
  to: [],
  cc: [],
  bcc: [],
  bodyText: "Body",
  bodyHtml: null,
  bodyTruncated: false,
  sourceSizeBytes: null,
  draftReplyToId: null,
  draftForwardOfId: null,
  attachments: [],
  labels: [],
};

const ACCOUNTS: MailAccountDto[] = [
  {
    id: "account-1",
    kind: "IMAP",
    mode: "MOCK",
    name: "First inbox",
    email: "first@example.com",
    imapHost: null,
    imapPort: null,
    imapSecurity: null,
    smtpHost: null,
    smtpPort: null,
    smtpSecurity: null,
    username: null,
    maskedHint: null,
    isValid: true,
    lastCheckedAt: null,
    isActive: true,
    isDefault: true,
    syncStatus: "IDLE",
    syncError: null,
    lastSyncAt: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  },
  {
    id: "account-2",
    kind: "IMAP",
    mode: "MOCK",
    name: "Second inbox",
    email: "second@example.com",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecurity: "SSL",
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    username: "second@example.com",
    maskedHint: "••••",
    isValid: true,
    lastCheckedAt: null,
    isActive: true,
    isDefault: false,
    syncStatus: "IDLE",
    syncError: null,
    lastSyncAt: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  },
];

const FOLDERS: Record<string, MailFolderDto[]> = {
  "account-1": [
    {
      id: "folder-1",
      path: "INBOX",
      name: "Inbox",
      specialUse: "INBOX",
      position: 0,
      unreadCount: 0,
    },
    {
      id: "archive-1",
      path: "Archive",
      name: "Archive",
      specialUse: "ARCHIVE",
      position: 5,
      unreadCount: 0,
    },
  ],
  "account-2": [
    {
      id: "folder-2",
      path: "INBOX",
      name: "Inbox",
      specialUse: "INBOX",
      position: 0,
      unreadCount: 0,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.fetchMailAccounts.mockResolvedValue([ACCOUNTS[0]]);
  apiMocks.fetchFolders.mockResolvedValue(FOLDERS["account-1"]);
  apiMocks.fetchMail.mockResolvedValue({ items: [], nextCursor: null });
  apiMocks.fetchMailFilterRules.mockResolvedValue([]);
  apiMocks.fetchMailLabels.mockResolvedValue([]);
  apiMocks.fetchMailById.mockResolvedValue(DETAIL);
  apiMocks.assignMailLabel.mockResolvedValue(undefined);
  apiMocks.removeMailLabel.mockResolvedValue(undefined);
  apiMocks.patchMailItem.mockResolvedValue(undefined);
  apiMocks.patchMailLabel.mockResolvedValue(undefined);
  apiMocks.deleteMailLabel.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Mail client state boundaries", () => {
  it("selects the workspace default mailbox instead of the first account", async () => {
    apiMocks.fetchMailAccounts.mockResolvedValue([
      { ...ACCOUNTS[0], isDefault: false },
      { ...ACCOUNTS[1], isDefault: true },
    ]);
    apiMocks.fetchFolders.mockImplementation(
      async (accountId: string) => FOLDERS[accountId] ?? [],
    );

    renderWithIntl(<MailClientView workspaceId="default-mailbox-workspace" />);

    await waitFor(() =>
      expect(apiMocks.fetchFolders).toHaveBeenCalledWith("account-2"),
    );
  });

  it("removes old-account rows before the destination folders resolve", async () => {
    const user = userEvent.setup();
    let resolveSecondFolders!: (folders: MailFolderDto[]) => void;
    const secondFolders = new Promise<MailFolderDto[]>((resolve) => {
      resolveSecondFolders = resolve;
    });
    const staleItem = { ...ITEM, isRead: true };

    apiMocks.fetchMailAccounts.mockResolvedValue(ACCOUNTS);
    apiMocks.fetchFolders.mockImplementation((accountId: string) =>
      accountId === "account-2"
        ? secondFolders
        : Promise.resolve(FOLDERS["account-1"]),
    );
    apiMocks.fetchMail.mockResolvedValue({
      items: [staleItem],
      nextCursor: "stale-next-page",
    });

    renderWithIntl(<MailClientView workspaceId="workspace-1" />);

    const staleRow = await screen.findByRole("button", {
      name: /Deployment complete/,
    });
    expect(staleRow).toBeEnabled();

    await user.click(screen.getByRole("combobox", { name: "Mail account" }));
    await user.click(screen.getByRole("option", { name: /Second inbox/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Deployment complete/ }),
      ).not.toBeInTheDocument(),
    );
    expect(apiMocks.fetchMail).toHaveBeenCalledTimes(1);

    resolveSecondFolders(FOLDERS["account-2"]);
    await waitFor(() => expect(apiMocks.fetchMail).toHaveBeenCalledTimes(2));
  });

  it("resets paging to the first page when the account changes", async () => {
    const user = userEvent.setup();
    const secondPageItem = {
      ...ITEM,
      id: "message-2",
      subject: "Second page message",
    };

    apiMocks.fetchMailAccounts.mockResolvedValue(ACCOUNTS);
    apiMocks.fetchFolders.mockImplementation(async (accountId: string) =>
      accountId === "account-2" ? FOLDERS["account-2"] : FOLDERS["account-1"],
    );
    apiMocks.fetchMail.mockImplementation(
      async ({ cursor }: { cursor?: string }) =>
        cursor === "cursor-page-2"
          ? { items: [secondPageItem], nextCursor: null }
          : { items: [ITEM], nextCursor: "cursor-page-2" },
    );

    renderWithIntl(<MailClientView workspaceId="workspace-1" />);

    await screen.findByRole("button", { name: /Deployment complete/ });
    expect(screen.getByText("Page 1")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByRole("button", { name: /Second page message/ });
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-page-2" }),
    );

    await user.click(
      await screen.findByRole("combobox", { name: "Mail account" }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Second inbox/ }),
    );

    await screen.findByRole("button", { name: /Deployment complete/ });
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: "account-2", cursor: undefined }),
    );
  });

  it("evicts a message when its active filter label is removed", async () => {
    const user = userEvent.setup();
    const label = ITEM.labels[0];
    const labeledItem = { ...ITEM, isRead: true, labels: [label] };
    const labeledDetail: MailDetailDto = {
      ...DETAIL,
      isRead: true,
      labels: [label],
    };
    let removed = false;

    apiMocks.fetchMailLabels.mockResolvedValue([label]);
    apiMocks.fetchMail.mockImplementation(async () => ({
      items: removed ? [] : [labeledItem],
      nextCursor: null,
    }));
    apiMocks.fetchMailById.mockResolvedValue(labeledDetail);
    apiMocks.removeMailLabel.mockImplementation(async () => {
      removed = true;
    });

    renderWithIntl(<MailClientView workspaceId="workspace-1" />);

    const labelsNav = await screen.findByRole("navigation", { name: "Labels" });
    await user.click(
      await within(labelsNav).findByRole("button", {
        name: "Production alerts",
      }),
    );
    const row = await screen.findByRole("button", {
      name: /Deployment complete/,
    });
    await user.click(row);
    await screen.findByRole("heading", {
      name: "Deployment complete",
    });

    await user.click(screen.getByRole("button", { name: "Edit labels" }));
    await user.click(screen.getByRole("option", { name: /Production alerts/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Deployment complete/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "Deployment complete" }),
    ).not.toBeInTheDocument();
    expect(apiMocks.removeMailLabel).toHaveBeenCalledWith(
      "message-1",
      "label-1",
    );
    expect(apiMocks.fetchMail).toHaveBeenCalledTimes(3);
  });

  it("shows labels immediately while existing-mail filtering runs", async () => {
    const user = userEvent.setup();
    const label = {
      id: "backfill-label",
      name: "Backfilled mail",
      color: "VIOLET" as const,
      position: 0,
    };
    const item = { ...ITEM, labels: [] };
    const detail = { ...DETAIL, labels: [] };
    const pendingRun = {
      id: "filter-run-1",
      ruleId: "filter-rule-1",
      status: "PENDING" as const,
      processedCount: 0,
      matchedCount: 0,
      attempts: 0,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-07-22T00:00:00.000Z",
    };
    apiMocks.fetchMailLabels.mockResolvedValue([label]);
    apiMocks.fetchMail.mockResolvedValue({ items: [item], nextCursor: null });
    apiMocks.fetchMailById.mockResolvedValue(detail);
    apiMocks.createMailFilterRule.mockResolvedValue({
      id: "filter-rule-1",
      accountId: item.accountId,
      labelId: label.id,
      name: "Backfill sender",
      fromAddress: item.from,
      subjectContains: null,
      isActive: true,
      position: 0,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      label: { name: label.name, color: label.color },
      latestRun: pendingRun,
    });
    apiMocks.fetchMailFilterRun.mockResolvedValue({
      ...pendingRun,
      status: "RUNNING",
    });

    renderWithIntl(<MailClientView workspaceId="backfill-workspace" />);

    const list = await screen.findByRole("list", { name: "Message list" });
    const row = within(list).getByRole("button", {
      name: /Deployment complete/,
    });
    await user.click(row);
    await screen.findByRole("heading", { name: "Deployment complete" });
    await user.click(
      screen.getByRole("button", { name: "Filter messages like this" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Filter messages like this",
    });
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Apply to existing mail",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save filter" }),
    );

    await waitFor(() =>
      expect(within(row).getByLabelText(label.name)).toBeVisible(),
    );
    const appliedLabels = screen.getByLabelText("Applied labels");
    expect(within(appliedLabels).getByLabelText(label.name)).toBeVisible();
    expect(apiMocks.fetchMail).toHaveBeenCalledTimes(1);
  });
});

describe("Mail label chips", () => {
  it("renders a noninteractive, truncated chip with its complete accessible name", () => {
    render(
      <LabelChip
        label={{
          name: "A very long production-alert label",
          color: "GREEN",
        }}
      />,
    );

    const chip = screen.getByLabelText("A very long production-alert label");
    expect(chip).not.toHaveAttribute("role", "button");
    expect(chip).toHaveAttribute("title", "A very long production-alert label");
    expect(chip).toHaveClass("max-w-28");
    expect(chip.querySelector("span")).toHaveClass("truncate");
  });

  it("uses the selected preset swatch color exactly on the rendered label", () => {
    renderWithIntl(
      <>
        <LabelColorField value="RED" onChange={vi.fn()} />
        <LabelChip label={{ name: "Urgent", color: "RED" }} />
      </>,
    );

    const redOption = screen.getByRole("button", { name: "Red" });
    const redSwatch = redOption.querySelector('[aria-hidden="true"]');
    const chip = screen.getByLabelText("Urgent");

    expect(redSwatch).toHaveStyle({ backgroundColor: "#D33C2C" });
    expect(chip).toHaveStyle({
      backgroundColor: "#D33C2C",
      borderColor: "#D33C2C",
      color: "#FFFFFF",
    });
  });

  it("renders custom hex colors with readable chip contrast", () => {
    render(<LabelChip label={{ name: "Custom blue", color: "#123456" }} />);

    const chip = screen.getByLabelText("Custom blue");
    expect(chip).toHaveStyle({
      backgroundColor: "#123456",
      borderColor: "#123456",
      color: "#FFFFFF",
    });
  });

  it("lets an operator create a standalone label with a visible color choice", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    apiMocks.createMailLabel.mockResolvedValueOnce({
      id: "created-label",
      name: "Build alerts",
      color: "GREEN",
      position: 0,
    });

    renderWithIntl(
      <ManageLabelsDialog
        open
        onOpenChange={vi.fn()}
        labels={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create label" }));
    await user.type(screen.getByLabelText("Label name"), "Build alerts");
    await user.click(screen.getByRole("button", { name: "Teal" }));
    await user.click(screen.getByRole("button", { name: "Create label" }));

    await waitFor(() =>
      expect(apiMocks.createMailLabel).toHaveBeenCalledWith({
        name: "Build alerts",
        color: "GREEN",
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom picker hex color and blocks malformed hex", async () => {
    const user = userEvent.setup();
    apiMocks.createMailLabel.mockResolvedValueOnce({
      id: "custom-label",
      name: "Brand alerts",
      color: "#12AB34",
      position: 0,
    });

    renderWithIntl(
      <ManageLabelsDialog
        open
        onOpenChange={vi.fn()}
        labels={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create label" }));
    await user.type(screen.getByLabelText("Label name"), "Brand alerts");
    const hexInput = screen.getByLabelText("Custom color hex value");
    await user.clear(hexInput);
    await user.type(hexInput, "#12345");
    expect(screen.getByRole("button", { name: "Create label" })).toBeDisabled();
    expect(
      screen.getByText("Enter a valid six-digit hex color."),
    ).toBeVisible();

    await user.type(hexInput, "6");
    await user.click(screen.getByRole("button", { name: "Create label" }));
    await waitFor(() =>
      expect(apiMocks.createMailLabel).toHaveBeenCalledWith({
        name: "Brand alerts",
        color: "#123456",
      }),
    );
  });

  it("supports label edit, reorder, and confirmed deletion", async () => {
    const user = userEvent.setup();
    const labels = ITEM.labels.slice(0, 2);
    apiMocks.patchMailLabel.mockResolvedValue(labels[0]);

    renderWithIntl(
      <ManageLabelsDialog
        open
        onOpenChange={vi.fn()}
        labels={labels}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Production alerts" }),
    );
    const nameInput = screen.getByLabelText("Label name");
    await user.clear(nameInput);
    await user.type(nameInput, "Critical builds");
    await user.click(screen.getByRole("button", { name: "Red" }));
    await user.click(screen.getByRole("button", { name: "Update label" }));
    await waitFor(() =>
      expect(apiMocks.patchMailLabel).toHaveBeenCalledWith("label-1", {
        name: "Critical builds",
        color: "RED",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Move Production alerts down",
      }),
    );
    await waitFor(() =>
      expect(apiMocks.patchMailLabel).toHaveBeenCalledWith("label-1", {
        position: 1,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Delete Production alerts" }),
    );
    expect(
      screen.getByText(/The label will be removed from messages/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    await waitFor(() =>
      expect(apiMocks.deleteMailLabel).toHaveBeenCalledWith("label-1"),
    );
  });

  it("keeps label forms recoverable and explains safe-delete conflicts", async () => {
    const user = userEvent.setup();
    const label = ITEM.labels[0];
    apiMocks.createMailLabel.mockRejectedValueOnce(
      new ApiError("LABEL_NAME_CONFLICT", {
        name: "LABEL_NAME_CONFLICT",
      }),
    );
    apiMocks.deleteMailLabel.mockRejectedValueOnce(
      new ApiError("LABEL_IN_USE"),
    );

    renderWithIntl(
      <ManageLabelsDialog
        open
        onOpenChange={vi.fn()}
        labels={[label]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create label" }));
    await user.type(screen.getByLabelText("Label name"), label.name);
    await user.click(screen.getByRole("button", { name: "Create label" }));
    expect(
      await screen.findByText("A label with this name already exists."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Label name")).toHaveValue(label.name);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      screen.getByRole("button", { name: `Delete ${label.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "This label is used by a filter or active existing-mail run.",
      ),
    );
    expect(screen.getByText(`Delete ${label.name}?`)).toBeVisible();
  });

  it("clears a deleted active label facet before refreshing mail", async () => {
    const user = userEvent.setup();
    const label = ITEM.labels[0];
    apiMocks.fetchMailLabels
      .mockResolvedValueOnce([label])
      .mockResolvedValueOnce([]);

    renderWithIntl(<MailClientView workspaceId="delete-filter-workspace" />);

    const labelsNav = await screen.findByRole("navigation", { name: "Labels" });
    await user.click(
      await within(labelsNav).findByRole("button", { name: label.name }),
    );
    await waitFor(() =>
      expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
        expect.objectContaining({ labelId: label.id }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Manage labels" }));
    await user.click(
      screen.getByRole("button", { name: `Delete ${label.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    await waitFor(() =>
      expect(apiMocks.deleteMailLabel).toHaveBeenCalledWith(label.id),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        within(labelsNav).getByRole("button", { name: "All labels" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelId: undefined }),
    );
  });

  it("shows label and filter management to workspace operators", async () => {
    renderWithIntl(<MailClientView workspaceId="member-workspace" />);
    expect(
      await screen.findByRole("button", { name: "Manage labels" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage filters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Labels" }),
    ).toBeInTheDocument();
  });

  it("renders label metadata inside the existing message-row button", () => {
    renderWithIntl(
      <MessageList
        items={[ITEM]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        selectedMessageId={null}
        onSelectMessage={vi.fn()}
        searchInput=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        sort="desc"
        onSortChange={vi.fn()}
        page={1}
        hasPrevious={false}
        hasNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        hasActiveFilters={false}
        isWebhookAccount
        onOpenSidebar={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /Deployment complete/ });
    expect(row).toHaveAccessibleName(/Automation/);
    expect(row).toContainElement(screen.getByLabelText("Production alerts"));
    expect(row).toContainElement(screen.getByLabelText("Deployments"));
    expect(row).toContainElement(screen.getByLabelText("2 more labels"));
    expect(row).toContainElement(screen.getByLabelText("1 more label"));
    const sortControl = screen.getByRole("combobox", {
      name: "Sort order",
    });
    expect(
      sortControl.querySelector(".ri-arrow-down-s-line"),
    ).toBeInTheDocument();
    expect(sortControl).not.toHaveTextContent("▼");
  });

  it("renders Markdown links as plain text in message previews", () => {
    renderWithIntl(
      <MessageList
        items={[{ ...ITEM, snippet: "[Meta](https://example.com) update" }]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        selectedMessageId={null}
        onSelectMessage={vi.fn()}
        searchInput=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        sort="desc"
        onSortChange={vi.fn()}
        page={1}
        hasPrevious={false}
        hasNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        hasActiveFilters={false}
        isWebhookAccount
        onOpenSidebar={vi.fn()}
      />,
    );

    expect(screen.getByText("Meta update")).toBeInTheDocument();
    expect(screen.queryByText(/\[Meta\]\(/)).not.toBeInTheDocument();
  });

  it("shows an accessible attachment marker in the message list", () => {
    renderWithIntl(
      <MessageList
        items={[{ ...ITEM, hasAttachments: true }]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        selectedMessageId={null}
        onSelectMessage={vi.fn()}
        searchInput=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        sort="desc"
        onSortChange={vi.fn()}
        page={1}
        hasPrevious={false}
        hasNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        hasActiveFilters={false}
        isWebhookAccount
        onOpenSidebar={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /Deployment complete/ });
    expect(row).toContainElement(screen.getByLabelText("Has attachments"));
  });

  it("filters from the sidebar and resets only through All labels", async () => {
    const user = userEvent.setup();
    const onSelectLabel = vi.fn();

    renderWithIntl(
      <MailSidebar
        accounts={[]}
        selectedAccountId={null}
        onSelectAccount={vi.fn()}
        folders={FOLDERS["account-1"]}
        foldersLoading={false}
        foldersError={null}
        onRetryFolders={vi.fn()}
        selectedFolderId="folder-1"
        onSelectFolder={vi.fn()}
        labels={ITEM.labels.map((label, index) => ({
          ...label,
          messageCount: [12, 3, 0][index],
        }))}
        labelsLoading={false}
        labelsError={null}
        onRetryLabels={vi.fn()}
        selectedLabelId="label-1"
        onSelectLabel={onSelectLabel}
        onSync={vi.fn()}
        syncing={false}
        onCompose={null}
      />,
    );

    const labelsNav = screen.getByRole("navigation", { name: "Labels" });
    const labelsNavQueries = within(labelsNav);
    const selectedFolder = within(
      screen.getByRole("navigation", { name: "Folders" }),
    ).getByRole("button", { name: "Inbox" });
    const selectedLabel = labelsNavQueries.getByRole("button", {
      name: "Production alerts",
    });
    expect(selectedFolder).toHaveClass(
      "dark:bg-secondary-300",
      "dark:hover:bg-secondary-400",
    );
    expect(selectedLabel).toHaveAttribute("aria-current", "true");
    expect(selectedLabel).toHaveClass(
      "dark:bg-secondary-300",
      "dark:hover:bg-secondary-400",
    );
    expect(selectedLabel).toHaveAccessibleDescription("12 emails");
    expect(within(selectedLabel).getByText("12")).toBeVisible();

    await user.click(
      labelsNavQueries.getByRole("button", { name: "Deployments" }),
    );
    expect(onSelectLabel).toHaveBeenLastCalledWith("label-2");
    await user.click(
      labelsNavQueries.getByRole("button", { name: "All labels" }),
    );
    expect(onSelectLabel).toHaveBeenLastCalledWith(null);
  });

  it("supports picker keyboard toggles and restores exact trigger focus", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    renderWithIntl(
      <MessageLabelPicker
        labels={ITEM.labels.slice(0, 2)}
        appliedLabelIds={new Set(["label-1"])}
        loading={false}
        error={null}
        mutationError={null}
        pendingLabelIds={new Set()}
        onRetry={vi.fn()}
        onToggle={onToggle}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Edit labels" });
    await user.click(trigger);
    const search = await screen.findByRole("textbox", {
      name: "Search labels",
    });
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    const first = screen.getByRole("option", { name: /Production alerts/ });
    expect(first).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onToggle).toHaveBeenLastCalledWith(ITEM.labels[0]);

    await user.keyboard("{ArrowDown}");
    const second = screen.getByRole("option", { name: /Deployments/ });
    expect(second).toHaveFocus();
    await user.keyboard(" ");
    expect(onToggle).toHaveBeenLastCalledWith(ITEM.labels[1]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("disables only a pending label and preserves confirmed state on failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithIntl(
      <MessageLabelPicker
        labels={ITEM.labels.slice(0, 2)}
        appliedLabelIds={new Set(["label-1"])}
        loading={false}
        error={null}
        mutationError="Failed to update message labels. Try again."
        pendingLabelIds={new Set(["label-1"])}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit labels" }));
    const first = screen.getByRole("option", { name: /Production alerts/ });
    const second = screen.getByRole("option", { name: /Deployments/ });
    expect(first).toBeDisabled();
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(second).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to update message labels",
    );
  });

  it("shows picker loading and recoverable label-load errors", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { unmount } = renderWithIntl(
      <MessageLabelPicker
        labels={[]}
        appliedLabelIds={new Set()}
        loading
        error={null}
        mutationError={null}
        pendingLabelIds={new Set()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit labels" }));
    expect(screen.getByLabelText("Loading labels…")).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <MessageLabelPicker
        labels={[]}
        appliedLabelIds={new Set()}
        loading={false}
        error="Failed to load labels. Please try again."
        mutationError={null}
        pendingLabelIds={new Set()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit labels" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reuses a newly created label when rule submission is retried", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiMocks.fetchMailLabels.mockResolvedValueOnce([]);
    apiMocks.createMailLabel.mockResolvedValueOnce({
      id: "created-label",
      name: "Build alerts",
      color: "GREEN",
      position: 0,
    });
    apiMocks.createMailFilterRule
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({ id: "created-rule" });

    renderWithIntl(
      <FilterRuleDialog
        open
        onOpenChange={vi.fn()}
        detail={DETAIL}
        accountName="Webhook"
        onSaved={onSaved}
      />,
    );

    await user.type(await screen.findByLabelText("Label name"), "Build alerts");
    const hexInput = screen.getByLabelText("Custom color hex value");
    await user.clear(hexInput);
    await user.type(hexInput, "#0ea5e9");
    await user.click(screen.getByRole("button", { name: "Save filter" }));
    await waitFor(() =>
      expect(apiMocks.createMailFilterRule).toHaveBeenCalledTimes(1),
    );
    expect(apiMocks.createMailLabel).toHaveBeenCalledTimes(1);
    expect(apiMocks.createMailLabel).toHaveBeenCalledWith({
      name: "Build alerts",
      color: "#0EA5E9",
    });
    expect(screen.queryByLabelText("Label name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save filter" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiMocks.createMailLabel).toHaveBeenCalledTimes(1);
    expect(apiMocks.createMailFilterRule).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelId: "created-label" }),
    );
  });
});

describe("Mail filter-rule lifecycle UI", () => {
  const LABEL = {
    id: "label-1",
    name: "Production alerts",
    color: "GREEN" as const,
    position: 0,
  };
  const RULE = {
    id: "rule-1",
    accountId: "account-1",
    labelId: LABEL.id,
    name: "Build messages",
    fromAddress: "sender@example.com",
    subjectContains: "Deployment",
    isActive: true,
    position: 0,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    label: { name: LABEL.name, color: LABEL.color },
    latestRun: null,
  };

  it("supports subject-only creation and rejects an empty predicate set", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiMocks.fetchMailLabels.mockResolvedValueOnce([LABEL]);
    apiMocks.createMailFilterRule.mockResolvedValueOnce(RULE);

    renderWithIntl(
      <FilterRuleDialog
        open
        onOpenChange={vi.fn()}
        detail={DETAIL}
        accountName="Webhook"
        onSaved={onSaved}
      />,
    );

    const sender = await screen.findByLabelText("Sender");
    const applyExisting = screen.getByRole("checkbox", {
      name: "Apply to existing mail",
    });
    expect(applyExisting).not.toBeChecked();
    await user.clear(sender);
    await user.click(screen.getByRole("button", { name: "Save filter" }));
    expect(
      screen.getByText("Add at least one complete condition."),
    ).toBeInTheDocument();
    expect(apiMocks.createMailFilterRule).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("combobox", { name: "Condition 1 field" }),
    );
    await user.click(await screen.findByRole("option", { name: "Subject" }));
    await user.type(
      screen.getByLabelText("Subject contains"),
      "  Deployment  ",
    );
    await user.click(screen.getByRole("combobox", { name: "Read status" }));
    await user.click(
      await screen.findByRole("option", { name: "Mark as read" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Move to folder" }));
    await user.click(await screen.findByRole("option", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Save filter" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiMocks.createMailFilterRule).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: DETAIL.accountId,
        labelId: LABEL.id,
        matchMode: "ALL",
        conditions: [
          {
            field: "SUBJECT",
            operator: "CONTAINS",
            value: "Deployment",
            isNegated: false,
          },
        ],
        setRead: true,
        moveToFolderId: "archive-1",
        applyToExistingMail: false,
      }),
    );
  });

  it("requests existing-mail processing only when explicitly checked", async () => {
    const user = userEvent.setup();
    apiMocks.fetchMailLabels.mockResolvedValueOnce([LABEL]);
    apiMocks.createMailFilterRule.mockResolvedValueOnce(RULE);

    renderWithIntl(
      <FilterRuleDialog
        open
        onOpenChange={vi.fn()}
        detail={DETAIL}
        accountName="Webhook"
        onSaved={vi.fn()}
      />,
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: "Apply to existing mail",
    });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save filter" }));

    await waitFor(() =>
      expect(apiMocks.createMailFilterRule).toHaveBeenCalledWith(
        expect.objectContaining({ applyToExistingMail: true }),
      ),
    );
  });

  it("retries label loading in place without losing rule input", async () => {
    const user = userEvent.setup();
    apiMocks.fetchMailLabels
      .mockRejectedValueOnce(new Error("Temporary label failure"))
      .mockResolvedValueOnce([LABEL]);

    renderWithIntl(
      <FilterRuleDialog
        open
        onOpenChange={vi.fn()}
        detail={DETAIL}
        accountName="Webhook"
        onSaved={vi.fn()}
      />,
    );

    const ruleName = screen.getByLabelText("Rule name");
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    const subject = screen.getByLabelText("Subject contains");
    await user.clear(ruleName);
    await user.type(ruleName, "Preserved rule name");
    await user.type(subject, "Preserved subject");
    expect(
      await screen.findByText("Failed to load labels. Please try again."),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save filter" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("combobox", { name: "Apply label" }),
    ).toBeInTheDocument();
    expect(ruleName).toHaveValue("Preserved rule name");
    expect(subject).toHaveValue("Preserved subject");
    expect(save).toBeEnabled();
  });

  it("localizes the backend subject length error code", async () => {
    const user = userEvent.setup();
    apiMocks.fetchMailLabels.mockResolvedValueOnce([LABEL]);
    apiMocks.createMailFilterRule.mockRejectedValueOnce(
      new ApiError("SUBJECT_FILTER_TOO_LONG", {
        subjectContains: "SUBJECT_FILTER_TOO_LONG",
      }),
    );

    renderWithIntl(
      <FilterRuleDialog
        open
        onOpenChange={vi.fn()}
        detail={DETAIL}
        accountName="Webhook"
        onSaved={vi.fn()}
      />,
    );

    await screen.findByRole("combobox", { name: "Apply label" });
    await user.click(screen.getByRole("button", { name: "Save filter" }));
    expect(
      await screen.findByText(
        "Subject text can contain at most 200 characters.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("SUBJECT_FILTER_TOO_LONG"),
    ).not.toBeInTheDocument();
  });

  it("edits, disables, reorders, and deletes while stating assignment persistence", async () => {
    const user = userEvent.setup();
    const secondRule = {
      ...RULE,
      id: "rule-2",
      name: "Release messages",
      position: 1,
    };
    apiMocks.fetchMailFilterRules.mockResolvedValue([RULE, secondRule]);
    apiMocks.fetchMailLabels.mockResolvedValue([LABEL]);
    apiMocks.patchMailFilterRule.mockResolvedValue(RULE);
    apiMocks.deleteMailFilterRule.mockResolvedValue(undefined);

    renderWithIntl(
      <FilterRulesDialog
        open
        onOpenChange={vi.fn()}
        accountId="account-1"
        accountName="First inbox"
        onRulesChanged={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("list", { name: "Filter rules" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Up", { selector: "span" })).toHaveLength(2);
    expect(screen.getAllByText(/subject contains Deployment/)).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Disable" })[0]);
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith("rule-1", {
        isActive: false,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Move Build messages down" }),
    );
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith("rule-1", {
        position: 1,
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(await screen.findByLabelText("Subject contains")).toHaveValue(
      "Deployment",
    );
    expect(
      screen.queryByRole("checkbox", {
        name: "Apply to existing mail",
      }),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Subject contains"));
    await user.type(screen.getByLabelText("Subject contains"), "Release");
    await user.click(screen.getByRole("button", { name: "Update filter" }));
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({
              field: "SUBJECT",
              operator: "CONTAINS",
              value: "Release",
            }),
          ]),
        }),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit" })[0]).toHaveFocus(),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete Build messages" }),
    );
    expect(
      screen.getByText(/Labels already applied to messages will remain/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(apiMocks.deleteMailFilterRule).toHaveBeenCalledWith("rule-1"),
    );
  });

  it("polls one run serially and stops after completion", async () => {
    vi.useFakeTimers();
    const pendingRun = {
      id: "run-1",
      ruleId: RULE.id,
      status: "PENDING" as const,
      processedCount: 0,
      matchedCount: 0,
      attempts: 0,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    const runningRun = {
      ...pendingRun,
      status: "RUNNING" as const,
      processedCount: 1,
      matchedCount: 1,
    };
    const completedRun = {
      ...runningRun,
      status: "COMPLETED" as const,
      completedAt: "2026-07-21T00:00:04.000Z",
    };
    apiMocks.fetchMailFilterRules.mockResolvedValue([
      { ...RULE, latestRun: pendingRun },
    ]);
    apiMocks.fetchMailFilterRun
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValueOnce(completedRun);

    renderWithIntl(
      <FilterRulesDialog
        open
        onOpenChange={vi.fn()}
        accountId="account-1"
        accountName="First inbox"
        onRulesChanged={vi.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "View progress" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("In progress")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getAllByText("1", { selector: "dd" })).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(2);
  });

  it("caps active-run polling and exposes manual refresh", async () => {
    vi.useFakeTimers();
    const pendingRun = {
      id: "run-capped",
      ruleId: RULE.id,
      status: "PENDING" as const,
      processedCount: 0,
      matchedCount: 0,
      attempts: 0,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    const runningRun = {
      ...pendingRun,
      status: "RUNNING" as const,
      processedCount: 20,
      matchedCount: 5,
      startedAt: "2026-07-21T00:00:02.000Z",
    };
    apiMocks.fetchMailFilterRules.mockResolvedValue([
      { ...RULE, latestRun: pendingRun },
    ]);
    apiMocks.fetchMailFilterRun.mockResolvedValue(runningRun);

    renderWithIntl(
      <FilterRulesDialog
        open
        onOpenChange={vi.fn()}
        accountId="account-1"
        accountName="First inbox"
        onRulesChanged={vi.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "View progress" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(122_000);
    });

    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(60);
    expect(screen.getByText("Automatic updates paused")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh status" }),
    ).toBeEnabled();
  });

  it("stops after a failed poll, restores focus on refresh, and cleans up on unmount", async () => {
    vi.useFakeTimers();
    const pendingRun = {
      id: "run-refresh",
      ruleId: RULE.id,
      status: "PENDING" as const,
      processedCount: 0,
      matchedCount: 0,
      attempts: 0,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    const runningRun = {
      ...pendingRun,
      status: "RUNNING" as const,
      processedCount: 3,
      matchedCount: 1,
      startedAt: "2026-07-21T00:00:02.000Z",
    };
    apiMocks.fetchMailFilterRules.mockResolvedValue([
      { ...RULE, latestRun: pendingRun },
    ]);
    apiMocks.fetchMailFilterRun
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue(runningRun);

    const { unmount } = renderWithIntl(
      <FilterRulesDialog
        open
        onOpenChange={vi.fn()}
        accountId="account-1"
        accountName="First inbox"
        onRulesChanged={vi.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "View progress" }));

    expect(
      screen.getAllByRole("button", {
        name: "Back to filter rules",
      })[1],
    ).toHaveFocus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await act(async () => {});
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(2);
    expect(
      screen.getAllByRole("button", {
        name: "Back to filter rules",
      })[1],
    ).toHaveFocus();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(2);
  });

  it("retries a failed run without discarding displayed progress", async () => {
    const user = userEvent.setup();
    const failedRun = {
      id: "run-failed",
      ruleId: RULE.id,
      status: "FAILED" as const,
      processedCount: 9,
      matchedCount: 4,
      attempts: 3,
      errorCode: "FILTER_RUN_PROCESSING_FAILED",
      startedAt: "2026-07-21T00:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    const pendingRun = {
      ...failedRun,
      status: "PENDING" as const,
      attempts: 0,
      errorCode: null,
    };
    apiMocks.fetchMailFilterRules.mockResolvedValue([
      { ...RULE, latestRun: failedRun },
    ]);
    apiMocks.retryMailFilterRun.mockResolvedValue(pendingRun);

    renderWithIntl(
      <FilterRulesDialog
        open
        onOpenChange={vi.fn()}
        accountId="account-1"
        accountName="First inbox"
        onRulesChanged={vi.fn()}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "View progress" }),
    );
    expect(
      screen.getAllByRole("button", {
        name: "Back to filter rules",
      })[1],
    ).toHaveFocus();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry processing" }));

    await waitFor(() =>
      expect(apiMocks.retryMailFilterRun).toHaveBeenCalledWith("run-failed"),
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "Back to filter rules",
      })[1],
    ).toHaveFocus();
  });
});
