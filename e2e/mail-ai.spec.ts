import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// The three AI mail features (specs/ai-integration.md scenarios 1-3) against a
// MOCK LLM credential.
//
// mode: "MOCK" is a hard requirement, not a convenience (architecture.md
// §7F.1): a real model is non-deterministic by construction, so this suite
// must never reach one. The mock driver echoes back the answer the feature
// itself built in src/lib/mail/ai-prompts.ts, which is why the assertions can
// name the message's own subject and sender domain. baseUrl points at the
// discard port as a second line of defence: if driver selection ever
// regressed, this suite must fail rather than call out.

const MOCK_INBOX_UNREAD = 10;

async function getWorkspaceId(page: Page): Promise<string> {
  const wsEl = page.locator("[data-workspace-id]").first();
  return (await wsEl.count()) > 0
    ? ((await wsEl.getAttribute("data-workspace-id")) ?? "")
    : "";
}

async function createMockMailAccount(
  page: Page,
  name: string,
): Promise<string> {
  const wsId = await getWorkspaceId(page);
  const result = await page.evaluate(
    async ([accountName, workspaceId]) => {
      const res = await fetch("/api/mail/accounts", {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspaceId,
        },
        body: JSON.stringify({
          name: accountName,
          email: "operator@inspot.local",
          imapHost: "imap.example.ru",
          imapPort: 993,
          imapSecurity: "SSL",
          smtpHost: "smtp.example.ru",
          smtpPort: 465,
          smtpSecurity: "SSL",
          username: "operator",
          password: "mock-app-password",
          mode: "MOCK",
        }),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    },
    [name, wsId] as const,
  );
  expect(result.status).toBe(201);
  const body = result.body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    throw new Error("Mail account POST response must contain a string id.");
  }
  return body.id;
}

async function waitForInitialSync(page: Page, accountId: string) {
  const wsId = await getWorkspaceId(page);
  await page.evaluate(
    async ([id, workspaceId]) => {
      const res = await fetch(
        `/api/mail/accounts/${encodeURIComponent(id)}/sync`,
        {
          method: "POST",
          redirect: "manual",
          headers: { "x-inspoter-workspace": workspaceId },
        },
      );
      if (res.status !== 200 && res.status !== 409) {
        throw new Error(`Manual sync failed with status ${res.status}.`);
      }
    },
    [accountId, wsId] as const,
  );
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ([id, workspaceId]) => {
            const res = await fetch(
              `/api/mail/accounts/${encodeURIComponent(id)}/folders`,
              {
                redirect: "manual",
                headers: { "x-inspoter-workspace": workspaceId },
              },
            );
            if (!res.ok) return -1;
            const folders = (await res.json()) as Array<{
              specialUse: string;
              unreadCount: number;
            }>;
            return (
              folders.find((folder) => folder.specialUse === "INBOX")
                ?.unreadCount ?? -1
            );
          },
          [accountId, wsId] as const,
        ),
      { timeout: 15_000 },
    )
    .toBe(MOCK_INBOX_UNREAD);
}

async function deleteMailAccount(page: Page, accountId: string) {
  const wsId = await getWorkspaceId(page);
  const status = await page.evaluate(
    async ([id, workspaceId]) =>
      (
        await fetch(`/api/mail/accounts/${encodeURIComponent(id)}`, {
          method: "DELETE",
          redirect: "manual",
          headers: { "x-inspoter-workspace": workspaceId },
        })
      ).status,
    [accountId, wsId] as const,
  );
  if (status !== 204 && status !== 404) {
    throw new Error(
      `Mail account cleanup failed for ${accountId}: received ${status}.`,
    );
  }
}

async function createMockLlmCredential(
  page: Page,
  label: string,
): Promise<string> {
  const wsId = await getWorkspaceId(page);
  const result = await page.evaluate(
    async ([credentialLabel, workspaceId]) => {
      const res = await fetch("/api/credentials", {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspaceId,
        },
        body: JSON.stringify({
          provider: "OPENAI_COMPATIBLE",
          label: credentialLabel,
          // Port 9 is the discard service — nothing can answer there.
          baseUrl: "http://127.0.0.1:9/v1",
          model: "mock-model",
          apiKey: "mock-key",
          // The settings dialog never sends this; only tests and e2e do.
          mode: "MOCK",
        }),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    },
    [label, wsId] as const,
  );
  expect(result.status).toBe(201);
  const body = result.body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    throw new Error("Credential POST response must contain a string id.");
  }
  return body.id;
}

async function deleteCredential(page: Page, credentialId: string) {
  const wsId = await getWorkspaceId(page);
  await page.evaluate(
    async ([id, workspaceId]) => {
      await fetch(`/api/credentials/${encodeURIComponent(id)}`, {
        method: "DELETE",
        redirect: "manual",
        headers: { "x-inspoter-workspace": workspaceId },
      });
    },
    [credentialId, wsId] as const,
  );
}

// The mock driver seeds a fixed set of subjects and senders
// (src/lib/mail/mock.ts), so the spec can name the message it opens and the
// domain the proposal is expected to key on.
const MESSAGE_SUBJECT = "Sprint results";
const SENDER_DOMAIN = "example.com";

async function openSeededMessage(page: Page) {
  await page.goto("/mail");
  await expect(
    page.getByRole("heading", { name: "Mail", exact: true }),
  ).toBeVisible();
  // The mock inbox cycles its subjects, so the same one appears several times;
  // any of them will do, they share the sender domain.
  await page
    .getByRole("list", { name: "Message list" })
    .getByRole("button", { name: new RegExp(MESSAGE_SUBJECT) })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: MESSAGE_SUBJECT, exact: true }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("AI controls stay hidden behind a clear message when no model is configured", async ({
  page,
  testData,
}) => {
  let accountId: string | undefined;
  try {
    accountId = await createMockMailAccount(page, testData.name("Mock IMAP"));
    await waitForInitialSync(page, accountId);
    await openSeededMessage(page);

    // The buttons are always rendered — there is no probe request on load.
    // The first click is what discovers the layer is off.
    await page.getByRole("button", { name: "Summarize", exact: true }).click();

    await expect(
      page.getByText("No model is configured", { exact: false }),
    ).toBeVisible();
  } finally {
    if (accountId) await deleteMailAccount(page, accountId);
  }
});

test("summarizes a message, drafts a reply and pre-fills a filter rule", async ({
  page,
  testData,
}) => {
  let accountId: string | undefined;
  let credentialId: string | undefined;
  try {
    accountId = await createMockMailAccount(page, testData.name("Mock IMAP"));
    await waitForInitialSync(page, accountId);
    credentialId = await createMockLlmCredential(
      page,
      testData.name("Mock model"),
    );

    await openSeededMessage(page);
    const pane = page.locator("[data-slot=message-pane]");

    // --- scenario 1: summary in the reading pane ---
    await page.getByRole("button", { name: "Summarize", exact: true }).click();
    const summaryPanel = page.locator("[data-slot=message-ai-summary]");
    await expect(summaryPanel).toBeVisible();
    // The mock answer is built from this very message, so the subject proves
    // the pipeline carried the right one all the way to the driver.
    await expect(summaryPanel).toContainText(MESSAGE_SUBJECT);
    await expect(summaryPanel).toContainText("Generated by a model");

    const axe = await new AxeBuilder({ page })
      .include("[data-slot=message-ai-summary]")
      .analyze();
    expect(
      axe.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);

    await page.getByRole("button", { name: "Hide summary" }).click();
    await expect(summaryPanel).toBeHidden();

    // --- scenario 2: reply draft in the composer ---
    await pane.getByRole("button", { name: "Reply", exact: true }).click();
    await page.getByRole("button", { name: "AI draft", exact: true }).click();
    await expect(
      page.getByText("Draft inserted", { exact: false }),
    ).toBeVisible();
    // The draft names the message it answers, and nothing was sent.
    await expect(page.locator("[data-slot=message-pane]")).toContainText(
      "Mock reply to",
    );

    // --- scenario 3: proposed filter rule, confirmed by the operator ---
    await page.reload();
    await openSeededMessage(page);
    await page
      .getByRole("button", { name: "Suggest a rule", exact: true })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The proposal only pre-fills the same dialog the manual button opens;
    // the sender domain arrives as an ordinary FROM_DOMAIN condition.
    await expect(
      dialog.getByRole("combobox", { name: "Condition 1 field" }),
    ).toContainText("Sender domain");
    await expect(
      dialog.getByLabel("Condition 1 value", { exact: true }),
    ).toHaveValue(SENDER_DOMAIN);
    // The model explains itself, and the label is still empty: the operator
    // has to choose one before this form will submit.
    await expect(dialog.getByText("Model's reasoning")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally {
    if (credentialId) await deleteCredential(page, credentialId);
    if (accountId) await deleteMailAccount(page, accountId);
  }
});
