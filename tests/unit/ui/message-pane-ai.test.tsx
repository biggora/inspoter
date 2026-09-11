// @vitest-environment jsdom

import { createRef } from "react";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  MessagePane,
  type MailAiSummaryState,
  type MessagePaneProps,
} from "@/components/mail/message-pane";
import type { MailDetailDto } from "@/components/mail/api";
import { downloadOriginalMessage } from "@/components/mail/api";
import { toast } from "sonner";
import { renderWithIntl } from "../../test-utils";

vi.mock("@/components/mail/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/mail/api")>()),
  downloadOriginalMessage: vi.fn(),
}));

// The AI half of the reading pane. MessagePane is purely presentational, so
// everything here is about what a given MailAiSummaryState renders and which
// callback a click reaches — never about fetching.

const detail: MailDetailDto = {
  id: "mail-1",
  accountId: "acc-1",
  folderId: "folder-1",
  accountKind: "IMAP",
  from: "billing@vendor.example",
  fromName: "Billing",
  to: [{ name: null, address: "ops@inspot.test" }],
  cc: [],
  bcc: [],
  subject: "Invoice 88213",
  snippet: null,
  bodyText: "Your invoice is ready.",
  bodyHtml: null,
  draftReplyToId: null,
  draftForwardOfId: null,
  isRead: true,
  isAnswered: false,
  isFlagged: false,
  hasAttachments: false,
  receivedAt: new Date("2026-08-01T09:00:00.000Z").toISOString(),
  attachments: [],
  labels: [],
} as unknown as MailDetailDto;

function renderPane(overrides: Partial<MessagePaneProps> = {}) {
  const props: MessagePaneProps = {
    detail,
    loading: false,
    error: null,
    onRetry: vi.fn(),
    hasSelection: true,
    onBack: vi.fn(),
    onReply: vi.fn(),
    onForward: vi.fn(),
    onEditDraft: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    onToggleRead: vi.fn(),
    canArchive: false,
    isInTrash: false,
    isDraft: false,
    labels: [],
    labelsLoading: false,
    labelsError: null,
    pendingLabelIds: new Set<string>(),
    labelMutationError: null,
    onRetryLabels: vi.fn(),
    onToggleLabel: vi.fn(),
    canCreateFilter: true,
    onCreateFilter: vi.fn(),
    filterTriggerRef: createRef<HTMLButtonElement>(),
    aiEnabled: true,
    summary: { status: "idle" },
    onSummarize: vi.fn(),
    onDismissSummary: vi.fn(),
    proposingFilter: false,
    onProposeFilter: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithIntl(<MessagePane {...props} />) };
}

const READY: MailAiSummaryState = {
  status: "ready",
  summary: "The vendor sent an invoice.",
  bullets: ["Invoice 88213", "Due 2026-09-01"],
  actionItems: ["Pay before the due date"],
  truncated: false,
};

describe("MessagePane AI controls", () => {
  it("offers original download only for non-draft transport messages", () => {
    const { unmount } = renderPane();
    expect(
      screen.getByRole("button", { name: "Download original (.eml)" }),
    ).toBeVisible();
    unmount();
    const draft = renderPane({ isDraft: true });
    expect(
      screen.queryByRole("button", { name: /Download original/ }),
    ).toBeNull();
    draft.unmount();
    renderPane({ detail: { ...detail, accountKind: "WEBHOOK" } });
    expect(
      screen.queryByRole("button", { name: /Download original/ }),
    ).toBeNull();
  });

  it("downloads the selected message and blocks duplicate clicks while pending", async () => {
    let finish!: () => void;
    vi.mocked(downloadOriginalMessage)
      .mockReset()
      .mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
    const user = userEvent.setup();
    renderPane();
    await user.click(
      screen.getByRole("button", { name: "Download original (.eml)" }),
    );
    const pending = screen.getByRole("button", {
      name: /Downloading original/,
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(downloadOriginalMessage).toHaveBeenCalledExactlyOnceWith(
      "mail-1",
      expect.any(Function),
    );
    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download original (.eml)" }),
      ).toBeEnabled(),
    );
  });

  it("reports failed original downloads and allows retry", async () => {
    vi.mocked(downloadOriginalMessage)
      .mockReset()
      .mockRejectedValue(new Error("offline"));
    const errorToast = vi
      .spyOn(toast, "error")
      .mockImplementation(() => "toast-id");
    try {
      const user = userEvent.setup();
      renderPane();
      await user.click(
        screen.getByRole("button", { name: "Download original (.eml)" }),
      );
      await waitFor(() =>
        expect(errorToast).toHaveBeenCalledWith(
          "Failed to download original message. Please try again.",
        ),
      );
      expect(
        screen.getByRole("button", { name: "Download original (.eml)" }),
      ).toBeEnabled();
    } finally {
      errorToast.mockRestore();
    }
  });

  it("renders no AI controls and no panel when the layer is off", () => {
    const { container } = renderPane({ aiEnabled: false });

    expect(screen.queryByRole("button", { name: "Summarize" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest a rule" })).toBeNull();
    expect(
      container.querySelector('[data-slot="message-ai-summary"]'),
    ).toBeNull();
  });

  it("shows no panel while the summary is idle", () => {
    const { container } = renderPane();

    expect(screen.getByRole("button", { name: "Summarize" })).toBeVisible();
    expect(
      container.querySelector('[data-slot="message-ai-summary"]'),
    ).toBeNull();
  });

  it("calls onSummarize once per click", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();

    await user.click(screen.getByRole("button", { name: "Summarize" }));

    expect(props.onSummarize).toHaveBeenCalledTimes(1);
  });

  it("disables the button while a summary is loading", () => {
    renderPane({ summary: { status: "loading" } });

    expect(screen.getByRole("button", { name: /Summarizing/ })).toBeDisabled();
  });

  it("renders the summary, its lists and the disclaimer", () => {
    const { container } = renderPane({ summary: READY });
    // Scoped to the panel: "Invoice 88213" is also the message subject in the
    // header above it.
    const panel = within(
      container.querySelector<HTMLElement>('[data-slot="message-ai-summary"]')!,
    );

    expect(panel.getByText("The vendor sent an invoice.")).toBeVisible();
    expect(panel.getByText("Invoice 88213")).toBeVisible();
    expect(panel.getByText("Pay before the due date")).toBeVisible();
    // The disclaimer is required by specs/ai-integration.md: the output is a
    // proposal the operator checks, never a fact the product asserts.
    expect(
      screen.getByText(/Generated by a model/, { exact: false }),
    ).toBeVisible();
  });

  it("mentions truncation only when the body was cut", () => {
    const { unmount } = renderPane({ summary: READY });
    expect(screen.queryByText(/only its beginning/)).toBeNull();
    unmount();

    renderPane({ summary: { ...READY, truncated: true } });
    expect(screen.getByText(/only its beginning/)).toBeVisible();
  });

  it("dismisses the panel through its own control", async () => {
    const user = userEvent.setup();
    const { props } = renderPane({ summary: READY });

    await user.click(screen.getByRole("button", { name: "Hide summary" }));

    expect(props.onDismissSummary).toHaveBeenCalledTimes(1);
  });

  it("renders the mapped error message for a failed summary", () => {
    renderPane({
      summary: { status: "error", messageKey: "errorAiUnavailable" },
    });

    expect(screen.getByText(/No model is configured/)).toBeVisible();
  });

  it("hides the suggestion button when filters are not offered", () => {
    renderPane({ canCreateFilter: false });

    expect(screen.queryByRole("button", { name: "Suggest a rule" })).toBeNull();
  });

  it("calls onProposeFilter and blocks a second click while pending", async () => {
    const user = userEvent.setup();
    const { props, unmount } = renderPane();

    await user.click(screen.getByRole("button", { name: "Suggest a rule" }));
    expect(props.onProposeFilter).toHaveBeenCalledTimes(1);
    unmount();

    renderPane({ proposingFilter: true });
    expect(
      screen.getByRole("button", { name: /Preparing a suggestion/ }),
    ).toBeDisabled();
  });
});
