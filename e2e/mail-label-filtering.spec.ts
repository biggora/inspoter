import AxeBuilder from "@axe-core/playwright";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

async function getWorkspaceId(page: Page): Promise<string> {
  const workspace = page.locator("button[data-workspace-id]").first();
  if ((await workspace.count()) === 0) {
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
    await expect(workspace).toBeVisible();
  }
  const workspaceId = (await workspace.getAttribute("data-workspace-id")) ?? "";
  expect(workspaceId).not.toBe("");
  await page.keyboard.press("Escape");
  return workspaceId;
}

async function getWorkspaceIdAndName(
  page: Page,
): Promise<{ id: string; name: string }> {
  const workspace = page.locator("button[data-workspace-id]").first();
  if ((await workspace.count()) === 0) {
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
    await expect(workspace).toBeVisible();
  }
  const id = (await workspace.getAttribute("data-workspace-id")) ?? "";
  expect(id).not.toBe("");
  const name = ((await workspace.textContent()) ?? "").trim();
  expect(name).not.toBe("");
  await page.keyboard.press("Escape");
  return { id, name };
}

async function createWebhookToken(
  page: Page,
  workspaceId: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const result = await page.evaluate(
    async ([activeWorkspaceId, tokenName]) => {
      const response = await fetch("/api/webhook-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": activeWorkspaceId,
        },
        body: JSON.stringify({ name: tokenName }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { id?: string; token?: string },
      };
    },
    [workspaceId, name] as const,
  );
  expect(result.status).toBe(201);
  expect(result.body.id).toEqual(expect.any(String));
  expect(result.body.token).toEqual(expect.any(String));
  return { id: result.body.id!, token: result.body.token! };
}

async function createWorkspace(
  page: Page,
  activeWorkspaceId: string,
  name: string,
): Promise<string> {
  const result = await page.evaluate(
    async ([workspaceId, workspaceName]) => {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspaceId,
        },
        body: JSON.stringify({ name: workspaceName }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { id?: string },
      };
    },
    [activeWorkspaceId, name] as const,
  );
  expect(result.status).toBe(201);
  expect(result.body.id).toEqual(expect.any(String));
  return result.body.id!;
}

async function switchWorkspace(
  page: Page,
  activeWorkspaceId: string,
  targetWorkspaceId: string,
) {
  const status = await page.evaluate(
    async ([workspaceId, targetId]) =>
      (
        await fetch("/api/workspaces/switch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-inspoter-workspace": workspaceId,
          },
          body: JSON.stringify({ workspaceId: targetId }),
        })
      ).status,
    [activeWorkspaceId, targetWorkspaceId] as const,
  );
  expect(status).toBe(200);
}

async function deleteWorkspace(
  page: Page,
  activeWorkspaceId: string,
  workspaceId: string,
) {
  const status = await page.evaluate(
    async ([currentWorkspaceId, targetId]) =>
      (
        await fetch(`/api/workspaces/${encodeURIComponent(targetId)}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": currentWorkspaceId },
        })
      ).status,
    [activeWorkspaceId, workspaceId] as const,
  );
  expect([204, 404]).toContain(status);
}

async function ingestMail(
  page: Page,
  token: string,
  input: { sender: string; subject: string; body: string },
) {
  const result = await page.evaluate(
    async ([webhookToken, payload]) => {
      const response = await fetch("/api/webhooks/mail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${webhookToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.text() };
    },
    [token, input] as const,
  );
  expect(result.status, result.body).toBe(201);
}

async function revokeWebhookToken(
  page: Page,
  workspaceId: string,
  tokenId: string,
) {
  const status = await page.evaluate(
    async ([activeWorkspaceId, id]) =>
      (
        await fetch(`/api/webhook-tokens/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": activeWorkspaceId },
        })
      ).status,
    [workspaceId, tokenId] as const,
  );
  expect([204, 404]).toContain(status);
}

async function createMockMailAccount(
  page: Page,
  workspaceId: string,
  name: string,
): Promise<string> {
  const result = await page.evaluate(
    async ([activeWorkspaceId, accountName]) => {
      const response = await fetch("/api/mail/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": activeWorkspaceId,
        },
        body: JSON.stringify({
          name: accountName,
          email: "labels-switch@inspot.local",
          imapHost: "imap.example.ru",
          imapPort: 993,
          imapSecurity: "SSL",
          smtpHost: "smtp.example.ru",
          smtpPort: 465,
          smtpSecurity: "SSL",
          username: "labels-switch",
          password: "mock-app-password",
          mode: "MOCK",
        }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { id?: string },
      };
    },
    [workspaceId, name] as const,
  );
  expect(result.status).toBe(201);
  expect(result.body.id).toEqual(expect.any(String));
  return result.body.id!;
}

async function waitForMockMailAccount(
  page: Page,
  workspaceId: string,
  accountId: string,
) {
  const syncStatus = await page.evaluate(
    async ([activeWorkspaceId, id]) =>
      (
        await fetch(`/api/mail/accounts/${encodeURIComponent(id)}/sync`, {
          method: "POST",
          headers: { "x-inspoter-workspace": activeWorkspaceId },
        })
      ).status,
    [workspaceId, accountId] as const,
  );
  expect([200, 409]).toContain(syncStatus);

  await expect
    .poll(
      () =>
        page.evaluate(
          async ([activeWorkspaceId, id]) => {
            const response = await fetch(
              `/api/mail/accounts/${encodeURIComponent(id)}/folders`,
              { headers: { "x-inspoter-workspace": activeWorkspaceId } },
            );
            if (!response.ok) return false;
            const folders = (await response.json()) as Array<{
              specialUse: string | null;
            }>;
            return folders.some((folder) => folder.specialUse === "INBOX");
          },
          [workspaceId, accountId] as const,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function deleteMailAccount(
  page: Page,
  workspaceId: string,
  accountId: string,
) {
  const status = await page.evaluate(
    async ([activeWorkspaceId, id]) =>
      (
        await fetch(`/api/mail/accounts/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": activeWorkspaceId },
        })
      ).status,
    [workspaceId, accountId] as const,
  );
  expect([204, 404]).toContain(status);
}

async function createLabel(
  page: Page,
  workspaceId: string,
  name: string,
  color: "RED" | "GREEN" | "BLUE",
): Promise<string> {
  const result = await page.evaluate(
    async ({ workspace, labelName, labelColor }) => {
      const response = await fetch("/api/mail/labels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspace,
        },
        body: JSON.stringify({ name: labelName, color: labelColor }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { id?: string },
      };
    },
    { workspace: workspaceId, labelName: name, labelColor: color },
  );
  expect(result.status).toBe(201);
  expect(result.body.id).toEqual(expect.any(String));
  return result.body.id!;
}

async function createMember(
  page: Page,
  workspaceId: string,
  username: string,
  password: string,
): Promise<string> {
  const result = await page.evaluate(
    async ({ workspace, memberName, memberPassword }) => {
      const response = await fetch(`/api/workspaces/${workspace}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspace,
        },
        body: JSON.stringify({
          username: memberName,
          password: memberPassword,
        }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { id?: string },
      };
    },
    {
      workspace: workspaceId,
      memberName: username,
      memberPassword: password,
    },
  );
  expect(result.status).toBe(201);
  expect(result.body.id).toEqual(expect.any(String));
  return result.body.id!;
}

async function removeMember(page: Page, workspaceId: string, memberId: string) {
  const status = await page.evaluate(
    async ({ workspace, id }) =>
      (
        await fetch(`/api/workspaces/${workspace}/members/${id}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": workspace },
        })
      ).status,
    { workspace: workspaceId, id: memberId },
  );
  expect([204, 404]).toContain(status);
}

async function createMemberContext(
  browser: Browser,
  baseURL: string,
  username: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
  });
  const appOrigin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const target = new URL(route.request().url());
    if (
      (target.protocol === "http:" || target.protocol === "https:") &&
      target.origin !== appOrigin
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await login(page, username, password);
  return { context, page };
}

async function expectNoBlockingAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    )
    .map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    }));
  expect(blocking).toEqual([]);
}

async function expectContainedInViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function getLabelsNavigation(page: Page, narrow: boolean) {
  if (narrow) {
    await page
      .getByRole("button", { name: "Accounts and folders", exact: true })
      .click();
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCSS(
      "opacity",
      "1",
    );
  }
  const navigation = page.getByRole("navigation", { name: "Labels" });
  await expect(navigation).toBeVisible();
  return navigation;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("owner creates a standalone label with a chosen color", async ({
  page,
  testData,
}) => {
  const originalWorkspaceId = await getWorkspaceId(page);
  const runId = `${testData.suffix}-${page.viewportSize()?.width ?? "unknown"}`;
  const labelName = `Priority-${runId}`;
  let workspaceId: string | undefined;
  let switched = false;

  try {
    workspaceId = await createWorkspace(
      page,
      originalWorkspaceId,
      `Label manager ${runId}`,
    );
    await switchWorkspace(page, originalWorkspaceId, workspaceId);
    switched = true;
    await page.goto("/ru/mail");

    const trigger = page.getByRole("button", {
      name: "Manage labels",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Manage labels",
    });
    await expectContainedInViewport(page, dialog);
    await expectNoBlockingAxeViolations(page);

    await dialog
      .getByRole("button", { name: "Create label", exact: true })
      .click();
    await dialog.getByLabel("Label name").fill(labelName);
    await dialog.getByRole("button", { name: "Teal" }).click();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/mail/labels") &&
          response.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create label", exact: true }).click(),
    ]);
    expect(createResponse.status()).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      name: labelName,
      color: "GREEN",
    });
    await expect(
      dialog.getByRole("group", { name: labelName, exact: true }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    const labelsNavigation = await getLabelsNavigation(
      page,
      (page.viewportSize()?.width ?? 1440) < 1024,
    );
    await expect(labelsNavigation.getByLabel(labelName)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    if (workspaceId) {
      if (switched) {
        await switchWorkspace(page, workspaceId, originalWorkspaceId);
      }
      await deleteWorkspace(page, originalWorkspaceId, workspaceId);
    }
  }
});

test("exact-sender tracer labels only future matching webhook mail", async ({
  page,
  testData,
}) => {
  const originalWorkspaceId = await getWorkspaceId(page);
  const runId = `${testData.suffix}-${page.viewportSize()?.width ?? "unknown"}`;
  let workspaceId: string | undefined;
  let switched = false;
  let webhook: { id: string; token: string } | undefined;
  const sender = `tracer-${runId}@example.com`;
  const seedSubject = `Tracer seed-${runId}`;
  const matchingSubject = `Tracer matching-${runId}`;
  const nonMatchingSubject = `Tracer nonmatching-${runId}`;
  const labelName = `Build alerts-${runId}`;

  try {
    workspaceId = await createWorkspace(
      page,
      originalWorkspaceId,
      `Mail tracer ${runId}`,
    );
    await switchWorkspace(page, originalWorkspaceId, workspaceId);
    switched = true;
    webhook = await createWebhookToken(
      page,
      workspaceId,
      `Mail label tracer-${runId}`,
    );
    await ingestMail(page, webhook.token, {
      sender,
      subject: seedSubject,
      body: "Open this message to define the exact-sender rule.",
    });

    await page.goto("/ru/mail");
    const list = page.getByRole("list", { name: "Message list" });
    const seedRow = list.getByRole("button", { name: new RegExp(seedSubject) });
    await expect(seedRow).toBeVisible();
    await seedRow.click();

    await page
      .getByRole("button", {
        name: "Filter messages like this",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Filter messages like this",
    });
    await expect(dialog.getByLabel("Account")).toHaveValue("Webhook");
    await expect(dialog.getByLabel("Sender")).toHaveValue(sender);
    await expect(
      dialog.getByRole("checkbox", {
        name: "Apply to existing mail",
      }),
    ).not.toBeChecked();
    await dialog.getByRole("combobox", { name: "Apply label" }).click();
    await page
      .getByRole("option", { name: "Create a new label", exact: true })
      .click();
    await dialog.getByLabel("Label name").fill(labelName);
    await expectNoBlockingAxeViolations(page);
    await expectContainedInViewport(page, dialog);
    await expectContainedInViewport(
      page,
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    );
    await expectContainedInViewport(
      page,
      dialog.getByRole("button", {
        name: "Save filter",
        exact: true,
      }),
    );
    await dialog
      .getByRole("button", { name: "Save filter", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Filter rule created.")).toBeVisible();

    await ingestMail(page, webhook.token, {
      sender: `  ${sender.toUpperCase()}  `,
      subject: matchingSubject,
      body: "This message must receive the label.",
    });
    await ingestMail(page, webhook.token, {
      sender: `prefix-${sender}`,
      subject: nonMatchingSubject,
      body: "This message must remain unlabeled.",
    });

    await page.reload();
    const refreshedList = page.getByRole("list", { name: "Message list" });
    const matchingRow = refreshedList.getByRole("button", {
      name: new RegExp(matchingSubject),
    });
    const nonMatchingRow = refreshedList.getByRole("button", {
      name: new RegExp(nonMatchingSubject),
    });
    await expect(matchingRow.getByLabel(labelName)).toBeVisible();
    await expect(nonMatchingRow).toBeVisible();
    await expect(nonMatchingRow.getByLabel(labelName)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    if (webhook && workspaceId) {
      await revokeWebhookToken(page, workspaceId, webhook.id).catch(() => {});
    }
    if (workspaceId) {
      if (switched) {
        await switchWorkspace(page, workspaceId, originalWorkspaceId);
      }
      await deleteWorkspace(page, originalWorkspaceId, workspaceId);
    }
  }
});

test("existing-mail run labels historical matches and exposes terminal progress", async ({
  page,
  testData,
}) => {
  test.setTimeout(180_000);
  const originalWorkspaceId = await getWorkspaceId(page);
  const runId = `backfill-${testData.suffix}-${page.viewportSize()?.width ?? "unknown"}`;
  let workspaceId: string | undefined;
  let switched = false;
  let webhook: { id: string; token: string } | undefined;
  const sender = `${runId}@example.com`;
  const matchingSubject = `Historical match ${runId}`;
  const nonMatchingSubject = `Historical other ${runId}`;
  const labelName = `Historical-${runId}`;
  const ruleName = `Historical rule-${runId}`;

  try {
    workspaceId = await createWorkspace(
      page,
      originalWorkspaceId,
      `Mail backfill ${runId}`,
    );
    await switchWorkspace(page, originalWorkspaceId, workspaceId);
    switched = true;
    webhook = await createWebhookToken(
      page,
      workspaceId,
      `Mail backfill-${runId}`,
    );
    await ingestMail(page, webhook.token, {
      sender,
      subject: matchingSubject,
      body: "This historical message must receive the label.",
    });
    await ingestMail(page, webhook.token, {
      sender: `other-${sender}`,
      subject: nonMatchingSubject,
      body: "This historical message must remain unlabeled.",
    });

    await page.goto("/ru/mail");
    const list = page.getByRole("list", { name: "Message list" });
    await list
      .getByRole("button", { name: new RegExp(matchingSubject) })
      .click();
    await page
      .getByRole("button", {
        name: "Filter messages like this",
        exact: true,
      })
      .click();
    const createDialog = page.getByRole("dialog", {
      name: "Filter messages like this",
    });
    await createDialog.getByLabel("Rule name").fill(ruleName);
    const applyExisting = createDialog.getByRole("checkbox", {
      name: "Apply to existing mail",
    });
    await expect(applyExisting).not.toBeChecked();
    await applyExisting.check();
    await expect(applyExisting).toBeChecked();
    await createDialog.getByRole("combobox", { name: "Apply label" }).click();
    await page
      .getByRole("option", { name: "Create a new label", exact: true })
      .click();
    await createDialog.getByLabel("Label name").fill(labelName);
    await expectNoBlockingAxeViolations(page);
    await expectContainedInViewport(page, createDialog);
    await createDialog
      .getByRole("button", { name: "Save filter", exact: true })
      .click();
    await expect(createDialog).toBeHidden();

    const manageTrigger = page.getByRole("button", {
      name: "Manage filters",
      exact: true,
    });
    await manageTrigger.click();
    const manager = page.getByRole("dialog", {
      name: "Manage filter rules",
    });
    const ruleRow = manager.getByRole("listitem").filter({ hasText: ruleName });
    await expect(ruleRow).toBeVisible();
    await ruleRow
      .getByRole("button", { name: "View progress", exact: true })
      .click();

    const runDialog = page.getByRole("dialog", {
      name: "Existing mail progress",
    });
    await expect(runDialog).toBeVisible();
    await expectContainedInViewport(page, runDialog);
    await expectNoBlockingAxeViolations(page);
    await expect(runDialog.getByText("Completed", { exact: true })).toBeVisible(
      { timeout: 90_000 },
    );
    await expect(
      runDialog.getByText("Messages processed", { exact: true }).locator(".."),
    ).toContainText("2");
    await expect(
      runDialog.getByText("Messages matched", { exact: true }).locator(".."),
    ).toContainText("1");
    await runDialog
      .getByRole("button", {
        name: "Back to filter rules",
        exact: true,
      })
      .last()
      .click();
    await manager
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(manageTrigger).toBeFocused();

    const backToList = page.getByRole("button", {
      name: "Back to list",
      exact: true,
    });
    if (await backToList.isVisible().catch(() => false)) {
      await backToList.click();
    }

    const currentList = page.getByRole("list", { name: "Message list" });
    const matchingRow = currentList.getByRole("button", {
      name: new RegExp(matchingSubject),
    });
    const nonMatchingRow = currentList.getByRole("button", {
      name: new RegExp(nonMatchingSubject),
    });
    await expect(matchingRow.getByLabel(labelName)).toBeVisible();
    await expect(nonMatchingRow).toBeVisible();
    await expect(nonMatchingRow.getByLabel(labelName)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    if (webhook && workspaceId) {
      await revokeWebhookToken(page, workspaceId, webhook.id).catch(() => {});
    }
    if (workspaceId) {
      if (switched) {
        await switchWorkspace(page, workspaceId, originalWorkspaceId);
      }
      await deleteWorkspace(page, originalWorkspaceId, workspaceId);
    }
  }
});

test("rule edit, disable, enable, and delete change only future behavior", async ({
  page,
  testData,
}) => {
  test.setTimeout(180_000);
  const originalWorkspaceId = await getWorkspaceId(page);
  const runId = `lifecycle-${testData.suffix}-${page.viewportSize()?.width ?? "unknown"}`;
  let workspaceId: string | undefined;
  let switched = false;
  let webhook: { id: string; token: string } | undefined;
  const sender = `${runId}@example.com`;
  const labelName = `Lifecycle-${runId}`;
  const ruleName = `Rule-${runId}`;
  const seedSubject = `Seed ${runId}`;
  const firstCriterion = `alpha-${runId}`;
  const secondCriterion = `beta-${runId}`;
  const firstMatch = `Message ${firstCriterion}`;
  const oldAfterEdit = `Edited old ${firstCriterion}`;
  const editedMatch = `Edited new ${secondCriterion}`;
  const disabledMatch = `Disabled ${secondCriterion}`;
  const enabledMatch = `Enabled ${secondCriterion}`;
  const deletedMatch = `Deleted ${secondCriterion}`;

  async function openManager() {
    const trigger = page.getByRole("button", {
      name: "Manage filters",
      exact: true,
    });
    await trigger.click();
    const manager = page.getByRole("dialog", {
      name: "Manage filter rules",
    });
    await expect(manager).toBeVisible();
    await expectContainedInViewport(page, manager);
    return { manager, trigger };
  }

  async function expectRowLabel(subject: string, expected: boolean) {
    const list = page.getByRole("list", { name: "Message list" });
    const row = list.getByRole("button", { name: new RegExp(subject) });
    await expect(row).toBeVisible();
    if (expected) await expect(row.getByLabel(labelName)).toBeVisible();
    else await expect(row.getByLabel(labelName)).toHaveCount(0);
  }

  try {
    workspaceId = await createWorkspace(
      page,
      originalWorkspaceId,
      `Mail lifecycle ${runId}`,
    );
    await switchWorkspace(page, originalWorkspaceId, workspaceId);
    switched = true;
    webhook = await createWebhookToken(
      page,
      workspaceId,
      `Mail lifecycle-${runId}`,
    );
    await ingestMail(page, webhook.token, {
      sender,
      subject: seedSubject,
      body: "Create and manage a future-message rule from this seed.",
    });

    await page.goto("/ru/mail");
    const list = page.getByRole("list", { name: "Message list" });
    await list.getByRole("button", { name: new RegExp(seedSubject) }).click();
    await page
      .getByRole("button", {
        name: "Filter messages like this",
        exact: true,
      })
      .click();
    const createDialog = page.getByRole("dialog", {
      name: "Filter messages like this",
    });
    await createDialog.getByLabel("Rule name").fill(ruleName);
    // The dialog seeds a single sender condition; a new one defaults to
    // subject-contains, which is what this rule keys on.
    await createDialog
      .getByRole("button", { name: "Add condition", exact: true })
      .click();
    await createDialog.getByLabel("Subject contains").fill(firstCriterion);
    await createDialog.getByRole("combobox", { name: "Apply label" }).click();
    await page
      .getByRole("option", { name: "Create a new label", exact: true })
      .click();
    await createDialog.getByLabel("Label name").fill(labelName);
    await createDialog
      .getByRole("button", { name: "Save filter", exact: true })
      .click();
    await expect(createDialog).toBeHidden();

    await ingestMail(page, webhook.token, {
      sender,
      subject: firstMatch,
      body: "Initial rule match.",
    });
    await page.reload();
    await expectRowLabel(firstMatch, true);

    let opened = await openManager();
    await expectNoBlockingAxeViolations(page);
    let ruleRow = opened.manager
      .getByRole("listitem")
      .filter({ hasText: ruleName });
    await ruleRow.getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Edit filter rule",
    });
    await editDialog.getByLabel("Subject contains").fill(secondCriterion);
    await editDialog
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await expect(
      opened.manager.getByRole("list", { name: "Filter rules" }),
    ).toBeVisible();
    await opened.manager
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(opened.trigger).toBeFocused();

    await ingestMail(page, webhook.token, {
      sender,
      subject: oldAfterEdit,
      body: "Old subject must no longer match.",
    });
    await ingestMail(page, webhook.token, {
      sender,
      subject: editedMatch,
      body: "Edited subject must match.",
    });
    await page.reload();
    await expectRowLabel(firstMatch, true);
    await expectRowLabel(oldAfterEdit, false);
    await expectRowLabel(editedMatch, true);

    opened = await openManager();
    ruleRow = opened.manager
      .getByRole("listitem")
      .filter({ hasText: ruleName });
    await ruleRow.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(ruleRow.getByText("Disabled", { exact: true })).toBeVisible();
    await opened.manager
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await ingestMail(page, webhook.token, {
      sender,
      subject: disabledMatch,
      body: "Disabled rule must not match.",
    });
    await page.reload();
    await expectRowLabel(disabledMatch, false);
    await expectRowLabel(editedMatch, true);

    opened = await openManager();
    ruleRow = opened.manager
      .getByRole("listitem")
      .filter({ hasText: ruleName });
    await ruleRow.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(ruleRow.getByText("Up", { exact: true })).toBeVisible();
    await opened.manager
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await ingestMail(page, webhook.token, {
      sender,
      subject: enabledMatch,
      body: "Re-enabled rule must match.",
    });
    await page.reload();
    await expectRowLabel(enabledMatch, true);

    opened = await openManager();
    ruleRow = opened.manager
      .getByRole("listitem")
      .filter({ hasText: ruleName });
    await ruleRow
      .getByRole("button", { name: `Remove ${ruleName}`, exact: true })
      .click();
    const confirm = page.getByRole("alertdialog", {
      name: "Delete filter rule?",
    });
    await expect(confirm).toContainText(
      "Labels already applied to messages will remain",
    );
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(ruleRow).toHaveCount(0);
    await opened.manager
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await ingestMail(page, webhook.token, {
      sender,
      subject: deletedMatch,
      body: "Deleted rule must not match.",
    });
    await page.reload();
    await expectRowLabel(deletedMatch, false);
    await expectRowLabel(firstMatch, true);
    await expectRowLabel(editedMatch, true);
    await expectRowLabel(enabledMatch, true);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    if (webhook && workspaceId) {
      await revokeWebhookToken(page, workspaceId, webhook.id).catch(() => {});
    }
    if (workspaceId) {
      if (switched) {
        await switchWorkspace(page, workspaceId, originalWorkspaceId);
      }
      await deleteWorkspace(page, originalWorkspaceId, workspaceId);
    }
  }
});

test("manual labels, combined browsing, keyboard and member access", async ({
  baseURL,
  browser,
  page,
  testData,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Playwright baseURL is required.");

  const { id: originalWorkspaceId, name: originalWorkspaceName } =
    await getWorkspaceIdAndName(page);
  const initialWidth = page.viewportSize()?.width ?? 1440;
  const narrow = initialWidth < 1024;
  const runId = `${testData.suffix}-${initialWidth}`;
  const workspaceName = `Mail manual labels ${runId}`;
  const switchAccountName = `Switch account ${runId}`;
  const commonSubject = `Combined labels ${runId}`;
  const targetSubject = `${commonSubject} target`;
  const otherSubject = `${commonSubject} other`;
  const labelNames = [
    `Production ${runId}`,
    `Deployments ${runId}`,
    `Automation ${runId}`,
  ];
  let workspaceId: string | undefined;
  let switched = false;
  let webhook: { id: string; token: string } | undefined;
  let mailAccountId: string | undefined;
  let memberId: string | undefined;
  let memberContext: BrowserContext | undefined;

  try {
    workspaceId = await createWorkspace(
      page,
      originalWorkspaceId,
      workspaceName,
    );
    await switchWorkspace(page, originalWorkspaceId, workspaceId);
    switched = true;
    webhook = await createWebhookToken(
      page,
      workspaceId,
      `Mail manual labels ${runId}`,
    );
    await createLabel(page, workspaceId, labelNames[0], "GREEN");
    await createLabel(page, workspaceId, labelNames[1], "BLUE");
    await createLabel(page, workspaceId, labelNames[2], "RED");
    if (testInfo.project.name === "desktop-1440") {
      mailAccountId = await createMockMailAccount(
        page,
        workspaceId,
        switchAccountName,
      );
      await waitForMockMailAccount(page, workspaceId, mailAccountId);
    }
    await ingestMail(page, webhook.token, {
      sender: `target-${runId}@example.com`,
      subject: targetSubject,
      body: "This message receives three manual labels.",
    });
    await ingestMail(page, webhook.token, {
      sender: `other-${runId}@example.com`,
      subject: otherSubject,
      body: "This message remains unlabeled.",
    });

    await page.goto("/ru/mail");
    if (testInfo.project.name === "desktop-1440") {
      const initialAccountSelect = page.getByRole("combobox", {
        name: "Mail account",
        exact: true,
      });
      await initialAccountSelect.click();
      await page.getByRole("option", { name: "Webhook", exact: true }).click();
      await expect(initialAccountSelect).toContainText("Webhook");
    }
    const list = page.getByRole("list", { name: "Message list" });
    await list.getByRole("button", { name: new RegExp(targetSubject) }).click();
    await expect(
      page.getByRole("heading", { name: targetSubject, exact: true }),
    ).toBeVisible();

    const pickerTrigger = page.getByRole("button", {
      name: "Edit labels",
      exact: true,
    });
    await pickerTrigger.click();
    const pickerSearch = page.getByRole("textbox", { name: "Search labels" });
    await expect(pickerSearch).toBeFocused();

    for (const labelName of labelNames) {
      await pickerSearch.fill(labelName);
      await page.keyboard.press("ArrowDown");
      const option = page.getByRole("option", {
        name: new RegExp(labelName),
      });
      await expect(option).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(option).toHaveAttribute("aria-selected", "true");
      await pickerSearch.focus();
    }

    await expectNoBlockingAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(pickerTrigger).toBeFocused();

    const detailHeader = page
      .getByRole("heading", { name: targetSubject, exact: true })
      .locator("..");
    for (const labelName of labelNames) {
      await expect(detailHeader.getByLabel(labelName)).toBeVisible();
    }

    await page
      .getByRole("button", { name: "Mark unread", exact: true })
      .click();
    if (narrow) {
      await page
        .getByRole("button", { name: "Back to list", exact: true })
        .click();
    }

    let targetRow = list.getByRole("button", {
      name: new RegExp(targetSubject),
    });
    await expect(targetRow.getByLabel(labelNames[0])).toBeVisible();
    if (narrow) {
      await expect(targetRow.getByLabel(labelNames[1])).toBeHidden();
      await expect(
        targetRow.getByLabel("2 more labels", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(targetRow.getByLabel(labelNames[1])).toBeVisible();
      await expect(
        targetRow.getByLabel("1 more label", { exact: true }),
      ).toBeVisible();
    }

    await page.getByLabel("Search mail").fill(commonSubject);
    await page
      .getByRole("button", { name: "Unread only", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Sort order" }).click();
    await page
      .getByRole("option", { name: "Oldest first", exact: true })
      .click();

    let labelsNavigation = await getLabelsNavigation(page, narrow);
    await expectNoBlockingAxeViolations(page);
    if (narrow) {
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", {
          name: "Accounts and folders",
          exact: true,
        }),
      ).toBeFocused();
      labelsNavigation = await getLabelsNavigation(page, true);
    }
    await labelsNavigation
      .getByRole("button", { name: labelNames[0], exact: true })
      .click();
    if (narrow) {
      await expect(
        page.getByRole("button", {
          name: "Accounts and folders",
          exact: true,
        }),
      ).toBeFocused();
    }
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("button", { name: new RegExp(targetSubject) }),
    ).toBeVisible();
    await expect(page.getByLabel("Search mail")).toHaveValue(commonSubject);
    await expect(
      page.getByRole("button", {
        name: "Unread only",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("combobox", { name: "Sort order" }),
    ).toContainText("Oldest first");

    labelsNavigation = await getLabelsNavigation(page, narrow);
    await labelsNavigation
      .getByRole("button", { name: "All labels", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(2);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    if (testInfo.project.name === "desktop-1440") {
      const accountSelect = page.getByRole("combobox", {
        name: "Mail account",
        exact: true,
      });
      await accountSelect.click();
      await page
        .getByRole("option", { name: new RegExp(switchAccountName) })
        .click();
      await expect(accountSelect).toContainText(switchAccountName);
      // Wait for the destination mailbox to settle — the list is cleared
      // during the switch, so asserting on pagination while the request is
      // still in flight would pass vacuously. The active search/unread
      // filters carry over, so the mock account may legitimately resolve to
      // the filtered empty state instead of a row.
      const mailboxSettled = list
        .getByRole("listitem")
        .first()
        .or(
          page.getByRole("heading", {
            name: "Nothing found",
            exact: true,
          }),
        );
      await expect(mailboxSettled.first()).toBeVisible();
      // The mock mailbox holds 30 messages against a 50-item page, so the
      // single-page result renders no pagination control. Paging reset on
      // account switch is covered by the unit test "resets paging to the first
      // page when the account changes".
      await expect(page.locator('[data-slot="pagination"]')).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: targetSubject, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: new RegExp(targetSubject) }),
      ).toHaveCount(0);

      await accountSelect.click();
      await page.getByRole("option", { name: "Webhook", exact: true }).click();
      await expect(accountSelect).toContainText("Webhook");
      await expect(
        list.getByRole("button", { name: new RegExp(targetSubject) }),
      ).toBeVisible();

      labelsNavigation = await getLabelsNavigation(page, false);
      await labelsNavigation
        .getByRole("button", { name: labelNames[0], exact: true })
        .click();
      targetRow = list.getByRole("button", {
        name: new RegExp(targetSubject),
      });
      await targetRow.click();
      await expect(
        page.getByRole("heading", { name: targetSubject, exact: true }),
      ).toBeVisible();

      await page
        .locator(`button[data-workspace-id="${workspaceId}"]`)
        .first()
        .click();
      await page
        .getByRole("menuitem", { name: originalWorkspaceName, exact: true })
        .click();
      await expect(
        page
          .locator(`button[data-workspace-id="${originalWorkspaceId}"]`)
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: targetSubject, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: new RegExp(targetSubject) }),
      ).toHaveCount(0);

      await page
        .locator(`button[data-workspace-id="${originalWorkspaceId}"]`)
        .first()
        .click();
      await page
        .getByRole("menuitem", { name: workspaceName, exact: true })
        .click();
      await expect(
        page.locator(`button[data-workspace-id="${workspaceId}"]`).first(),
      ).toBeVisible();
      await expect(page.getByLabel("Search mail")).toHaveValue("");
      await expect(
        page.getByRole("button", {
          name: "Unread only",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByRole("combobox", { name: "Sort order" }),
      ).toContainText("Newest first");
      // Same as above: assert only once the restored workspace's mailbox has
      // rendered, otherwise the empty in-flight list would satisfy this.
      await expect(mailboxSettled.first()).toBeVisible();
      await expect(page.locator('[data-slot="pagination"]')).toHaveCount(0);
      labelsNavigation = await getLabelsNavigation(page, false);
      await expect(
        labelsNavigation.getByRole("button", {
          name: "All labels",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "true");
      await accountSelect.click();
      await page.getByRole("option", { name: "Webhook", exact: true }).click();
      await expect(accountSelect).toContainText("Webhook");
      await expect(
        list.getByRole("button", { name: new RegExp(targetSubject) }),
      ).toBeVisible();

      const memberName = `mail-member-${runId}`;
      const memberPassword = "member-local-test-password";
      memberId = await createMember(
        page,
        workspaceId,
        memberName,
        memberPassword,
      );
      const memberSession = await createMemberContext(
        browser,
        baseURL,
        memberName,
        memberPassword,
      );
      memberContext = memberSession.context;
      const memberPage = memberSession.page;
      await memberPage.goto("/ru/mail");
      const memberAccountSelect = memberPage.getByRole("combobox", {
        name: "Mail account",
        exact: true,
      });
      await memberAccountSelect.click();
      await memberPage
        .getByRole("option", { name: "Webhook", exact: true })
        .click();
      await expect(memberAccountSelect).toContainText("Webhook");
      const memberList = memberPage.getByRole("list", {
        name: "Message list",
      });
      await memberList
        .getByRole("button", { name: new RegExp(targetSubject) })
        .click();
      await expect(
        memberPage.getByRole("button", {
          name: "Filter messages like this",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", {
          name: "Manage labels",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", {
          name: "Manage filters",
          exact: true,
        }),
      ).toBeVisible();

      const memberPickerTrigger = memberPage.getByRole("button", {
        name: "Edit labels",
        exact: true,
      });
      await memberPickerTrigger.click();
      const memberSearch = memberPage.getByRole("textbox", {
        name: "Search labels",
      });
      await memberSearch.fill(labelNames[2]);
      await memberPage.keyboard.press("ArrowDown");
      const memberOption = memberPage.getByRole("option", {
        name: new RegExp(labelNames[2]),
      });
      await memberPage.keyboard.press("Enter");
      await expect(memberOption).toHaveAttribute("aria-selected", "false");
      await memberOption.focus();
      await memberPage.keyboard.press("Enter");
      await expect(memberOption).toHaveAttribute("aria-selected", "true");
      await memberPage.keyboard.press("Escape");
      await expect(memberPickerTrigger).toBeFocused();

      await memberPage.getByLabel("Search mail").fill(commonSubject);
      const memberLabels = await getLabelsNavigation(memberPage, false);
      await memberLabels
        .getByRole("button", { name: labelNames[0], exact: true })
        .click();
      await expect(memberList.getByRole("listitem")).toHaveCount(1);
    }
  } finally {
    await memberContext?.close();
    if (memberId && workspaceId) {
      await removeMember(page, workspaceId, memberId).catch(() => {});
    }
    if (mailAccountId && workspaceId) {
      await deleteMailAccount(page, workspaceId, mailAccountId).catch(() => {});
    }
    if (webhook && workspaceId) {
      await revokeWebhookToken(page, workspaceId, webhook.id).catch(() => {});
    }
    if (workspaceId) {
      if (switched) {
        await switchWorkspace(page, workspaceId, originalWorkspaceId);
      }
      await deleteWorkspace(page, originalWorkspaceId, workspaceId);
    }
  }
});
