// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MailAccountDialog } from "@/components/settings/mail-account-dialog";
import type {
  MailAccountDto,
  TestConnectionResult,
} from "@/components/settings/mail-accounts-api";
import { renderWithIntl } from "../../test-utils";

// "Проверить подключение" used to answer a blocked SMTP port with a bare
// "SMTP: Connection timeout", which reads like an application bug rather than a
// network one. These tests pin the localized hint to the transport error code,
// and pin that it stays out of the way for failures it cannot explain.

const apiMocks = vi.hoisted(() => ({
  test: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/components/settings/mail-accounts-api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/settings/mail-accounts-api")
    >();
  return { ...actual, mailAccountsApi: apiMocks };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EXISTING: MailAccountDto = {
  id: "account-1",
  kind: "IMAP",
  mode: "REAL",
  name: "Operator",
  email: "operator@example.com",
  imapHost: "mail.example.com",
  imapPort: 993,
  imapSecurity: "SSL",
  smtpHost: "mail.example.com",
  smtpPort: 465,
  smtpSecurity: "SSL",
  username: "operator@example.com",
  maskedHint: "••••",
  isValid: true,
  lastCheckedAt: null,
  isActive: true,
  isDefault: true,
  syncStatus: "IDLE",
  syncError: null,
  lastSyncAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function result(
  overrides: Partial<TestConnectionResult> = {},
): TestConnectionResult {
  return {
    imapOk: true,
    smtpOk: false,
    error: null,
    imapFailure: null,
    smtpFailure: null,
    ...overrides,
  };
}

async function testConnection() {
  const user = userEvent.setup();
  renderWithIntl(
    <MailAccountDialog
      open
      onOpenChange={() => {}}
      mode="edit"
      existing={EXISTING}
      onSaved={() => {}}
    />,
  );
  await user.type(screen.getByLabelText("Password"), "app-password");
  await user.click(screen.getByRole("button", { name: "Test connection" }));
}

beforeAll(() => {
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MailAccountDialog test connection", () => {
  it("explains a blocked SMTP port and keeps the raw transport error", async () => {
    apiMocks.test.mockResolvedValue(
      result({
        error: "SMTP mail.example.com:465: Connection timeout (ETIMEDOUT)",
        smtpFailure: {
          protocol: "SMTP",
          host: "mail.example.com",
          port: 465,
          code: "ETIMEDOUT",
          message: "Connection timeout (ETIMEDOUT)",
        },
      }),
    );

    await testConnection();

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(
      "The SMTP server mail.example.com did not respond on port 465",
    );
    expect(status.textContent).toContain("Try port 587 with STARTTLS");
    // The technical line stays available for the operator to quote.
    expect(status.textContent).toContain(
      "SMTP mail.example.com:465: Connection timeout (ETIMEDOUT)",
    );
  });

  it("shows only the technical error when the failure is not a connectivity one", async () => {
    apiMocks.test.mockResolvedValue(
      result({
        error:
          "SMTP mail.example.com:465: Invalid login (EAUTH) — 535 5.7.8 Authentication failed",
        smtpFailure: {
          protocol: "SMTP",
          host: "mail.example.com",
          port: 465,
          code: "EAUTH",
          message: "Invalid login (EAUTH) — 535 5.7.8 Authentication failed",
        },
      }),
    );

    await testConnection();

    const status = await screen.findByRole("status");
    await waitFor(() => {
      expect(status.textContent).toContain("535 5.7.8 Authentication failed");
    });
    expect(status.textContent).not.toContain("did not respond on port");
  });
});
