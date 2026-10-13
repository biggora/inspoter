import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/notes");
});

test("a newly created note appears in the notes tree without a reload", async ({
  page,
  testData,
}) => {
  const title = testData.name("Tree refresh note");
  const workspaceId =
    (await page
      .locator("[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")) ?? "";

  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await page.waitForURL(/\/notes\/[^/]+$/);
  const noteId = new URL(page.url()).pathname.split("/").pop() ?? "";
  testData.registerTeardown({
    description: "created note",
    method: "DELETE",
    url: `/api/notes/${noteId}`,
    workspaceId,
  });

  await expect(
    page
      .getByRole("tree", { name: "All notes", exact: true })
      .getByText(title, { exact: true }),
  ).toBeVisible();
});
