import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// The contacts a spec creates are named with a per-run suffix so parallel
// workers (and reruns against a database that was not reset) never collide.
const RUN = `e2e-${Date.now().toString(36)}`;

const FIXTURES = path.join(
  process.cwd(),
  "tests",
  "unit",
  "contacts",
  "fixtures",
);

test.beforeEach(async ({ page }) => {
  await login(page);
  // Sign-in lands on Dashboards, so this suite navigates to its own section.
  await page.goto("/contacts");
});

async function createContact(
  page: Page,
  {
    firstName,
    lastName,
    email,
  }: { firstName: string; lastName: string; email: string },
) {
  // The toolbar and the empty-state both expose a "New contact" button, so
  // pin the toolbar one (it is the first match in DOM order and is always
  // present, regardless of whether the list is empty).
  await page.getByRole("button", { name: "New contact" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill(firstName);
  await dialog.getByLabel("Last name").fill(lastName);
  await dialog.getByRole("button", { name: "Email", exact: true }).click();
  await dialog.getByLabel("Value").fill(email);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("creates a contact, finds it by search, and opens its detail page", async ({
  page,
}) => {
  const lastName = `Petrova-${RUN}`;
  await createContact(page, {
    firstName: "Anna",
    lastName,
    email: `anna.${RUN}@example.com`,
  });

  const row = page.getByRole("link", { name: `Anna ${lastName}` });
  await expect(row).toBeVisible();

  // Search is server-side and URL-backed, so it must survive a reload.
  await page.getByLabel("Search contacts").fill(lastName);
  await expect(page).toHaveURL(new RegExp(`query=${lastName}`));
  await page.reload();
  await expect(
    page.getByRole("link", { name: `Anna ${lastName}` }),
  ).toBeVisible();

  await page.getByRole("link", { name: `Anna ${lastName}` }).click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: `Anna ${lastName}` }),
  ).toBeVisible();
  await expect(page.getByText(`anna.${RUN}@example.com`)).toBeVisible();
});

test("finds a contact by a phone number typed without its formatting", async ({
  page,
}) => {
  const lastName = `Dialer-${RUN}`;
  await page.getByRole("button", { name: "New contact" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill("Boris");
  await dialog.getByLabel("Last name").fill(lastName);
  await dialog.getByRole("button", { name: "Phone", exact: true }).click();
  await dialog.getByLabel("Value").fill("+371 20 555 010");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Search contacts").fill("+37120555010");
  await expect(
    page.getByRole("link", { name: `Boris ${lastName}` }),
  ).toBeVisible();
});

test("imports a vCard file and reports what it did", async ({ page }) => {
  await page.getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("File")
    .setInputFiles(path.join(FIXTURES, "google-export.vcf"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect(dialog.getByText("Import finished")).toBeVisible();
  await expect(dialog.getByText(/Read from file: 2/)).toBeVisible();
  // The dialog carries both an auto-rendered X close (first) and this footer
  // "Close" button (last); pick the footer one explicitly.
  await dialog.getByRole("button", { name: "Close" }).last().click();

  await page.getByLabel("Search contacts").fill("Inspot Support");
  await expect(
    page.getByRole("link", { name: "Inspot Support" }),
  ).toBeVisible();
});

test("groups duplicates and merges them into one contact", async ({ page }) => {
  const shared = `dupe.${RUN}@example.com`;
  await createContact(page, {
    firstName: "Carol",
    lastName: `Mendez-${RUN}`,
    email: shared,
  });
  await createContact(page, {
    firstName: "Carol",
    lastName: `Mendez-${RUN}`,
    email: shared,
  });

  await page.goto("/contacts/duplicates");
  const group = page
    .locator("section")
    .filter({ hasText: `Carol Mendez-${RUN}` })
    .first();
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: /^Merge/ }).click();
  // The merge is async (POST + router.refresh); navigating immediately would
  // abort it. The duplicates page re-renders without this group once the
  // merge lands, so waiting for it to disappear proves the POST completed.
  await expect(group).toBeHidden();

  await page.goto(`/contacts?query=Mendez-${RUN}`);
  await expect(
    page.getByRole("link", { name: `Carol Mendez-${RUN}` }),
  ).toHaveCount(1);
});

test("exports the address book as a vCard download", async ({ page }) => {
  await createContact(page, {
    firstName: "Export",
    lastName: `Target-${RUN}`,
    email: `export.${RUN}@example.com`,
  });

  // The toolbar Export button shares its accessible name with the per-row
  // "Actions for Export Target-…" menu trigger; the toolbar one is first.
  await page.getByRole("button", { name: "Export" }).first().click();
  const dialog = page.getByRole("dialog");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("contacts.vcf");
});

test("applies a label and filters the list by it", async ({ page }) => {
  const labelName = `Team-${RUN}`;
  await createContact(page, {
    firstName: "Labeled",
    lastName: `Person-${RUN}`,
    email: `labeled.${RUN}@example.com`,
  });

  await page.getByRole("button", { name: "Manage labels" }).first().click();
  const labelDialog = page.getByRole("dialog");
  await labelDialog.getByRole("button", { name: "Add label" }).click();
  await labelDialog.getByLabel("Name").fill(labelName);
  await labelDialog.getByRole("button", { name: "Save" }).click();
  // Same X-vs-footer "Close" ambiguity as the import dialog: pick the footer.
  await labelDialog.getByRole("button", { name: "Close" }).last().click();

  await page.getByLabel("Search contacts").fill(`Person-${RUN}`);
  await page.getByLabel(`Select Labeled Person-${RUN}`).check();
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByRole("menuitem", { name: labelName }).click();

  await expect(
    page.getByRole("link", { name: `Labeled Person-${RUN}` }),
  ).toBeVisible();
});
