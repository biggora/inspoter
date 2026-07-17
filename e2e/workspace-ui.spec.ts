import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

async function activeWorkspaceId(page: Parameters<typeof login>[0]) {
  const id = await page
    .locator("[data-workspace-id]")
    .first()
    .getAttribute("data-workspace-id");
  if (!id) throw new Error("The active workspace id is required for cleanup.");
  return id;
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/settings/workspace");
  await expect(
    page.getByRole("heading", { name: "Рабочее пространство", exact: true }),
  ).toBeVisible();
});

test("workspace rename exposes validation, pending, and success states", async ({
  page,
  testData,
}) => {
  const workspaceId = await activeWorkspaceId(page);
  const name = page.getByLabel("Название рабочего пространства", {
    exact: true,
  });
  const originalName = await name.inputValue();
  const renamed = testData.name("Workspace UI");
  let renamePersisted = false;
  let releasePatch = () => {};

  await page.route(`**/api/workspaces/${workspaceId}`, async (route) => {
    if (route.request().method() !== "PATCH" || renamePersisted) {
      await route.continue();
      return;
    }
    await new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    await route.continue();
  });

  try {
    await name.fill("   ");
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    const validation = page.getByText(
      "Название рабочего пространства обязательно.",
      { exact: true },
    );
    await expect(validation).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const validationId = await validation.getAttribute("id");
    if (!validationId) throw new Error("Validation message must have an id.");
    await expect(name).toHaveAttribute("aria-describedby", validationId);

    await name.fill(renamed);
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/workspaces/${workspaceId}` &&
        response.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();

    const pending = page.getByRole("button", {
      name: "Сохранение…",
      exact: true,
    });
    await expect(pending).toBeDisabled();
    await expect(pending.locator('[data-slot="spinner"]')).toBeVisible();
    releasePatch();

    const response = await responsePromise;
    expect(response.status()).toBe(200);
    renamePersisted = true;
    await expect(
      page.getByText("Рабочее пространство переименовано.", { exact: true }),
    ).toBeVisible();
  } finally {
    releasePatch();
    if (renamePersisted) {
      const status = await page.evaluate(
        async ([id, oldName]) =>
          (
            await fetch(`/api/workspaces/${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-inspoter-workspace": id,
              },
              body: JSON.stringify({ name: oldName }),
            })
          ).status,
        [workspaceId, originalName] as const,
      );
      expect(status).toBe(200);
    }
  }
});

test("owner can validate, add, and remove a workspace member", async ({
  page,
  testData,
}) => {
  const workspaceId = await activeWorkspaceId(page);
  const username = testData.name("member-ui");
  let memberId: string | undefined;

  try {
    await page
      .getByRole("button", { name: "Добавить участника", exact: true })
      .click();
    const usernameInput = page.getByLabel("Имя пользователя", { exact: true });
    await expect(
      page.getByText("Имя пользователя обязательно.", { exact: true }),
    ).toBeVisible();
    await expect(usernameInput).toHaveAttribute("aria-invalid", "true");

    await usernameInput.fill(username);
    await page
      .getByLabel("Пароль (только для нового пользователя)", { exact: true })
      .fill("member-password");
    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/workspaces/${workspaceId}/members` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Добавить участника", exact: true })
      .click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const body: unknown = await createResponse.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof body.id !== "string"
    ) {
      throw new Error("Member POST response must contain a string id.");
    }
    memberId = body.id;
    await expect(page.getByText(username, { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: `Удалить ${username}`, exact: true })
      .click();
    await expect(
      page.getByRole("alertdialog", { name: `Удалить «${username}»?` }),
    ).toBeVisible();
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/workspaces/${workspaceId}/members/${memberId}` &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    expect((await deleteResponsePromise).status()).toBe(204);
    memberId = undefined;
    await expect(page.getByText(username, { exact: true })).toHaveCount(0);
  } finally {
    if (memberId) {
      const status = await page.evaluate(
        async ([workspace, member]) =>
          (
            await fetch(`/api/workspaces/${workspace}/members/${member}`, {
              method: "DELETE",
              headers: { "x-inspoter-workspace": workspace },
            })
          ).status,
        [workspaceId, memberId] as const,
      );
      expect([204, 404]).toContain(status);
    }
  }
});
