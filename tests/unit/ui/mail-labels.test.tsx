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
  bodyText: "Body",
  bodyHtml: null,
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

    await user.click(
      screen.getByRole("combobox", { name: "Почтовый аккаунт" }),
    );
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

    renderWithIntl(
      <MailClientView workspaceId="workspace-1" mailLabelsEnabled />,
    );

    const labelsNav = await screen.findByRole("navigation", { name: "Метки" });
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

    await user.click(screen.getByRole("button", { name: "Изменить метки" }));
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

    renderWithIntl(
      <MailClientView
        workspaceId="backfill-workspace"
        mailLabelsEnabled
        canManageRules
      />,
    );

    const list = await screen.findByRole("list", { name: "Список писем" });
    const row = within(list).getByRole("button", {
      name: /Deployment complete/,
    });
    await user.click(row);
    await screen.findByRole("heading", { name: "Deployment complete" });
    await user.click(
      screen.getByRole("button", { name: "Фильтровать похожие письма" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Фильтровать похожие письма",
    });
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Применить к существующей почте",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Сохранить фильтр" }),
    );

    await waitFor(() =>
      expect(within(row).getByLabelText(label.name)).toBeVisible(),
    );
    const appliedLabels = screen.getByLabelText("Применённые метки");
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

  it("renders custom hex colors with readable chip contrast", () => {
    render(<LabelChip label={{ name: "Custom blue", color: "#123456" }} />);

    const chip = screen.getByLabelText("Custom blue");
    expect(chip).toHaveStyle({
      backgroundColor: "#123456",
      borderColor: "#123456",
      color: "#FFFFFF",
    });
  });

  it("lets an owner create a standalone label with a visible color choice", async () => {
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

    await user.click(screen.getByRole("button", { name: "Создать метку" }));
    await user.type(screen.getByLabelText("Название метки"), "Build alerts");
    await user.click(screen.getByRole("button", { name: "Зелёный" }));
    await user.click(screen.getByRole("button", { name: "Создать метку" }));

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

    await user.click(screen.getByRole("button", { name: "Создать метку" }));
    await user.type(screen.getByLabelText("Название метки"), "Brand alerts");
    const hexInput = screen.getByLabelText("HEX-код своего цвета");
    await user.clear(hexInput);
    await user.type(hexInput, "#12345");
    expect(
      screen.getByRole("button", { name: "Создать метку" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Введите корректный шестизначный HEX-код."),
    ).toBeVisible();

    await user.type(hexInput, "6");
    await user.click(screen.getByRole("button", { name: "Создать метку" }));
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
      screen.getByRole("button", { name: "Изменить Production alerts" }),
    );
    const nameInput = screen.getByLabelText("Название метки");
    await user.clear(nameInput);
    await user.type(nameInput, "Critical builds");
    await user.click(screen.getByRole("button", { name: "Красный" }));
    await user.click(screen.getByRole("button", { name: "Обновить метку" }));
    await waitFor(() =>
      expect(apiMocks.patchMailLabel).toHaveBeenCalledWith("label-1", {
        name: "Critical builds",
        color: "RED",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Переместить Production alerts ниже",
      }),
    );
    await waitFor(() =>
      expect(apiMocks.patchMailLabel).toHaveBeenCalledWith("label-1", {
        position: 1,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Удалить Production alerts" }),
    );
    expect(screen.getByText(/Метка будет удалена с писем/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить метку" }));
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

    await user.click(screen.getByRole("button", { name: "Создать метку" }));
    await user.type(screen.getByLabelText("Название метки"), label.name);
    await user.click(screen.getByRole("button", { name: "Создать метку" }));
    expect(
      await screen.findByText("Метка с таким названием уже существует."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Название метки")).toHaveValue(label.name);

    await user.click(screen.getByRole("button", { name: "Отмена" }));
    await user.click(
      screen.getByRole("button", { name: `Удалить ${label.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Удалить метку" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Метка используется фильтром или активной обработкой существующей почты.",
      ),
    );
    expect(screen.getByText(`Удалить метку «${label.name}»?`)).toBeVisible();
  });

  it("clears a deleted active label facet before refreshing mail", async () => {
    const user = userEvent.setup();
    const label = ITEM.labels[0];
    apiMocks.fetchMailLabels
      .mockResolvedValueOnce([label])
      .mockResolvedValueOnce([]);

    renderWithIntl(
      <MailClientView
        workspaceId="delete-filter-workspace"
        mailLabelsEnabled
        canManageRules
      />,
    );

    const labelsNav = await screen.findByRole("navigation", { name: "Метки" });
    await user.click(
      await within(labelsNav).findByRole("button", { name: label.name }),
    );
    await waitFor(() =>
      expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
        expect.objectContaining({ labelId: label.id }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Управление метками" }),
    );
    await user.click(
      screen.getByRole("button", { name: `Удалить ${label.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Удалить метку" }));
    await waitFor(() =>
      expect(apiMocks.deleteMailLabel).toHaveBeenCalledWith(label.id),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        within(labelsNav).getByRole("button", { name: "Все метки" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    expect(apiMocks.fetchMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelId: undefined }),
    );
  });

  it("shows label management only to workspace owners", async () => {
    const { unmount } = renderWithIntl(
      <MailClientView
        workspaceId="owner-workspace"
        mailLabelsEnabled
        canManageRules
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Управление метками" }),
    ).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <MailClientView workspaceId="member-workspace" mailLabelsEnabled />,
    );
    expect(
      await screen.findByRole("navigation", { name: "Метки" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Управление метками" }),
    ).not.toBeInTheDocument();
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
    expect(row).toContainElement(screen.getByLabelText("Ещё меток: 2"));
    expect(row).toContainElement(screen.getByLabelText("Ещё меток: 1"));
    const sortControl = screen.getByRole("combobox", {
      name: "Порядок сортировки",
    });
    expect(
      sortControl.querySelector(".ri-arrow-down-s-line"),
    ).not.toBeInTheDocument();
  });

  it("filters from the sidebar and resets only through All labels", async () => {
    const user = userEvent.setup();
    const onSelectLabel = vi.fn();

    renderWithIntl(
      <MailSidebar
        accounts={[]}
        selectedAccountId={null}
        onSelectAccount={vi.fn()}
        folders={[]}
        foldersLoading={false}
        foldersError={null}
        onRetryFolders={vi.fn()}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        mailLabelsEnabled
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

    const labelsNav = screen.getByRole("navigation", { name: "Метки" });
    const labelsNavQueries = within(labelsNav);
    const selectedLabel = labelsNavQueries.getByRole("button", {
      name: "Production alerts",
    });
    expect(selectedLabel).toHaveAttribute("aria-current", "true");
    expect(selectedLabel).toHaveAccessibleDescription("12 писем");
    expect(within(selectedLabel).getByText("12")).toBeVisible();

    await user.click(
      labelsNavQueries.getByRole("button", { name: "Deployments" }),
    );
    expect(onSelectLabel).toHaveBeenLastCalledWith("label-2");
    await user.click(
      labelsNavQueries.getByRole("button", { name: "Все метки" }),
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

    const trigger = screen.getByRole("button", { name: "Изменить метки" });
    await user.click(trigger);
    const search = await screen.findByRole("textbox", { name: "Поиск меток" });
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
        mutationError="Не удалось изменить метки письма. Попробуйте снова."
        pendingLabelIds={new Set(["label-1"])}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Изменить метки" }));
    const first = screen.getByRole("option", { name: /Production alerts/ });
    const second = screen.getByRole("option", { name: /Deployments/ });
    expect(first).toBeDisabled();
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(second).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось изменить метки письма",
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
    await user.click(screen.getByRole("button", { name: "Изменить метки" }));
    expect(screen.getByLabelText("Загрузка меток…")).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <MessageLabelPicker
        labels={[]}
        appliedLabelIds={new Set()}
        loading={false}
        error="Не удалось загрузить метки. Попробуйте снова."
        mutationError={null}
        pendingLabelIds={new Set()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Изменить метки" }));
    await user.click(screen.getByRole("button", { name: "Повторить" }));
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

    await user.type(
      await screen.findByLabelText("Название метки"),
      "Build alerts",
    );
    const hexInput = screen.getByLabelText("HEX-код своего цвета");
    await user.clear(hexInput);
    await user.type(hexInput, "#0ea5e9");
    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));
    await waitFor(() =>
      expect(apiMocks.createMailFilterRule).toHaveBeenCalledTimes(1),
    );
    expect(apiMocks.createMailLabel).toHaveBeenCalledTimes(1);
    expect(apiMocks.createMailLabel).toHaveBeenCalledWith({
      name: "Build alerts",
      color: "#0EA5E9",
    });
    expect(screen.queryByLabelText("Название метки")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));
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

    const sender = await screen.findByLabelText("Отправитель");
    const applyExisting = screen.getByRole("checkbox", {
      name: "Применить к существующей почте",
    });
    expect(applyExisting).not.toBeChecked();
    await user.clear(sender);
    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));
    expect(
      screen.getByText("Укажите отправителя или текст темы."),
    ).toBeInTheDocument();
    expect(apiMocks.createMailFilterRule).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Тема содержит"), "  Deployment  ");
    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiMocks.createMailFilterRule).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: DETAIL.accountId,
        labelId: LABEL.id,
        fromAddress: null,
        subjectContains: "Deployment",
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
      name: "Применить к существующей почте",
    });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));

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

    const ruleName = screen.getByLabelText("Название правила");
    const subject = screen.getByLabelText("Тема содержит");
    await user.clear(ruleName);
    await user.type(ruleName, "Preserved rule name");
    await user.type(subject, "Preserved subject");
    expect(
      await screen.findByText("Не удалось загрузить метки. Попробуйте снова."),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Сохранить фильтр" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(
      await screen.findByRole("combobox", { name: "Применить метку" }),
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

    await screen.findByRole("combobox", { name: "Применить метку" });
    await user.type(screen.getByLabelText("Тема содержит"), "Subject filter");
    await user.click(screen.getByRole("button", { name: "Сохранить фильтр" }));
    expect(
      await screen.findByText("Текст темы не должен превышать 200 символов."),
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
      await screen.findByRole("list", { name: "Правила фильтрации" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Включено", { selector: "span" })).toHaveLength(
      2,
    );
    expect(screen.getAllByText(/тема содержит Deployment/)).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Отключить" })[0]);
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith("rule-1", {
        isActive: false,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Переместить Build messages ниже" }),
    );
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith("rule-1", {
        position: 1,
      }),
    );

    await user.click(screen.getAllByRole("button", { name: "Изменить" })[0]);
    expect(await screen.findByLabelText("Тема содержит")).toHaveValue(
      "Deployment",
    );
    expect(
      screen.queryByRole("checkbox", {
        name: "Применить к существующей почте",
      }),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Тема содержит"));
    await user.type(screen.getByLabelText("Тема содержит"), "Release");
    await user.click(screen.getByRole("button", { name: "Обновить фильтр" }));
    await waitFor(() =>
      expect(apiMocks.patchMailFilterRule).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ subjectContains: "Release" }),
      ),
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Изменить" })[0],
      ).toHaveFocus(),
    );
    await user.click(
      screen.getByRole("button", { name: "Удалить Build messages" }),
    );
    expect(
      screen.getByText(/Уже применённые к письмам метки сохранятся/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ход обработки" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("Выполняется")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("Завершено")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Ход обработки" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(122_000);
    });

    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(60);
    expect(
      screen.getByText("Автоматическое обновление приостановлено"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Обновить состояние" }),
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
    fireEvent.click(screen.getByRole("button", { name: "Ход обработки" }));

    expect(
      screen.getAllByRole("button", {
        name: "Назад к правилам фильтрации",
      })[1],
    ).toHaveFocus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Состояние недоступно")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    await act(async () => {});
    expect(apiMocks.fetchMailFilterRun).toHaveBeenCalledTimes(2);
    expect(
      screen.getAllByRole("button", {
        name: "Назад к правилам фильтрации",
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
      await screen.findByRole("button", { name: "Ход обработки" }),
    );
    expect(
      screen.getAllByRole("button", {
        name: "Назад к правилам фильтрации",
      })[1],
    ).toHaveFocus();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Повторить обработку" }),
    );

    await waitFor(() =>
      expect(apiMocks.retryMailFilterRun).toHaveBeenCalledWith("run-failed"),
    );
    expect(screen.getByText("Ожидает обработки")).toBeInTheDocument();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "Назад к правилам фильтрации",
      })[1],
    ).toHaveFocus();
  });
});
