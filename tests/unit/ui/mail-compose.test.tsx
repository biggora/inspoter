// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ComposeDialog,
  InlineReplyComposer,
} from "@/components/mail/compose-dialog";
import type { MailDetailDto } from "@/components/mail/api";
import { renderWithIntl } from "../../test-utils";

const apiMocks = vi.hoisted(() => ({
  deleteMailDraftAttachment: vi.fn(),
  saveMailDraft: vi.fn(),
  sendMail: vi.fn(),
  uploadMailDraftAttachment: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
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
  return { ApiError, ...apiMocks };
});

const ORIGINAL: MailDetailDto = {
  id: "message-1",
  accountId: "account-1",
  folderId: "folder-1",
  accountKind: "IMAP",
  from: "sender@example.com",
  fromName: "Sender",
  to: [{ name: null, address: "operator@example.com" }],
  cc: [],
  bcc: [],
  subject: "Status report",
  snippet: "Original body",
  bodyText: "Original body",
  bodyHtml: "<p>Original body</p>",
  draftReplyToId: null,
  draftForwardOfId: null,
  isRead: true,
  isAnswered: false,
  isFlagged: false,
  hasAttachments: false,
  receivedAt: "2026-07-21T09:30:00.000Z",
  attachments: [],
  labels: [],
};

beforeAll(() => {
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.sendMail.mockResolvedValue({ id: "sent-1" });
  apiMocks.saveMailDraft.mockImplementation(
    async (input: {
      draftId?: string;
      accountId: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      bodyText: string;
      bodyHtml: string;
      inReplyToId?: string;
      forwardOfId?: string;
    }) => ({
      id: input.draftId ?? "draft-1",
      accountId: input.accountId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      inReplyToId: input.inReplyToId ?? null,
      forwardOfId: input.forwardOfId ?? null,
      updatedAt: "2026-07-22T12:00:00.000Z",
      attachments: [],
    }),
  );
  apiMocks.uploadMailDraftAttachment.mockResolvedValue({
    id: "attachment-1",
    filename: "report.txt",
    contentType: "text/plain",
    sizeBytes: 11,
  });
  apiMocks.deleteMailDraftAttachment.mockResolvedValue(undefined);
});

describe("mail composer", () => {
  it("sends formatted HTML and plain text from the large composer", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSent = vi.fn();
    renderWithIntl(
      <ComposeDialog
        open
        onOpenChange={onOpenChange}
        mode="new"
        original={null}
        accountId="account-1"
        onSent={onSent}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Кому"), "to@example.com");
    await user.type(within(dialog).getByLabelText("Тема"), "Hello");
    const body = await within(dialog).findByLabelText("Текст письма");
    await user.click(body);
    await user.click(
      within(dialog).getByRole("button", { name: "Полужирный" }),
    );
    await user.type(body, "Formatted reply");
    await user.click(within(dialog).getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(apiMocks.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: "Formatted reply",
          bodyHtml: "<p><strong>Formatted reply</strong></p>",
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSent).toHaveBeenCalledOnce();
  });

  it("renders reply inline and sends with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    renderWithIntl(
      <InlineReplyComposer
        original={ORIGINAL}
        accountId="account-1"
        onSent={onSent}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const composer = screen.getByRole("region", { name: "Ответить" });
    expect(within(composer).getByLabelText("Кому")).toHaveValue(
      "sender@example.com",
    );
    expect(within(composer).getByLabelText("Тема")).toHaveValue(
      "Re: Status report",
    );

    const body = await within(composer).findByLabelText("Текст письма");
    await user.type(body, "Reply body");
    fireEvent.keyDown(body, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(apiMocks.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: "Reply body",
          inReplyToId: ORIGINAL.id,
        }),
      );
    });
    expect(onSent).toHaveBeenCalledOnce();
  });

  it("saves dirty content before closing", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithIntl(
      <ComposeDialog
        open
        onOpenChange={onOpenChange}
        mode="new"
        original={null}
        accountId="account-1"
        onSent={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Тема"), "Unsent");
    await user.click(
      within(dialog).getByRole("button", { name: "Закрыть редактор" }),
    );

    await waitFor(() => {
      expect(apiMocks.saveMailDraft).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Unsent" }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("offers discard only when saving before close fails", async () => {
    apiMocks.saveMailDraft.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithIntl(
      <ComposeDialog
        open
        onOpenChange={onOpenChange}
        mode="new"
        original={null}
        accountId="account-1"
        onSent={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Тема"), "Unsent");
    await user.click(
      within(dialog).getByRole("button", { name: "Закрыть редактор" }),
    );

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Удалить это сообщение?",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("creates a draft before uploading an attachment", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ComposeDialog
        open
        onOpenChange={vi.fn()}
        mode="new"
        original={null}
        accountId="account-1"
        onSent={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const fileInput =
      dialog.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(["hello world"], "report.txt", {
      type: "text/plain",
    });
    await user.upload(fileInput!, file);

    await waitFor(() => {
      expect(apiMocks.saveMailDraft).toHaveBeenCalledOnce();
      expect(apiMocks.uploadMailDraftAttachment).toHaveBeenCalledWith(
        "draft-1",
        file,
      );
    });
    expect(within(dialog).getByText("report.txt")).toBeInTheDocument();
    expect(toastMocks.success).toHaveBeenCalled();
  });
});
