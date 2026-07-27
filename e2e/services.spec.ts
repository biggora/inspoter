import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Services section (plan.md "Раздел 'Services'..." — not part of the
// original 7-section PRD, so these tests trace to plan.md's user flows
// rather than prd.md AC-* ids), mirroring bookmarks.spec.ts's structure:
// login -> create/edit/delete via the form dialogs -> API response
// assertions via page.waitForResponse -> cleanup.
//
// The HTTP monitor in every test targets testData.localUrl("/login") — the
// app's own public login page — so the server-side checkHttp() fetch is a
// same-origin loopback call with a deterministic 200 response, never a real
// external network call (matches how bookmarks.spec.ts uses
// testData.localUrl() for its own bookmark URLs).
test.beforeEach(async ({ page }) => {
  await login(page);
});

function serviceCard(page: Page, name: string) {
  // Card containers on /services use `.rounded-xl` (services-view.tsx);
  // nothing else on that page uses the same class (the empty-state box uses
  // `.rounded-lg`), so scoping by "contains this exact heading" reliably
  // isolates a single card even when other services are present.
  return page.locator(".rounded-xl").filter({
    has: page.getByRole("heading", { name, exact: true, level: 2 }),
  });
}

async function expectInsideHorizontally(container: Locator, target: Locator) {
  const [containerBox, targetBox] = await Promise.all([
    container.boundingBox(),
    target.boundingBox(),
  ]);
  if (!containerBox || !targetBox) {
    throw new Error("Expected the card and its action to have bounding boxes.");
  }

  expect(targetBox.x).toBeGreaterThanOrEqual(containerBox.x);
  expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 0.5,
  );
}

async function createHttpService(
  page: Page,
  fields: { name: string; url: string },
) {
  await page.getByRole("button", { name: "Новый сервис", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill(fields.name);
  await page.getByLabel("URL", { exact: true }).fill(fields.url);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/services" && response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    body.id.trim().length === 0
  ) {
    throw new Error(
      "Service POST response must contain a non-empty string id.",
    );
  }

  await expect(serviceCard(page, fields.name)).toBeVisible();
  return body.id;
}

async function deleteViaApi(page: Page, path: string, what: string) {
  const wsEl = page.locator("[data-workspace-id]").first();
  const wsId =
    (await wsEl.count()) > 0
      ? ((await wsEl.getAttribute("data-workspace-id")) ?? "")
      : "";
  const status = await page.evaluate(
    async ([url, workspaceId]) =>
      (
        await fetch(url, {
          method: "DELETE",
          redirect: "manual",
          headers: { "x-inspoter-workspace": workspaceId },
        })
      ).status,
    [path, wsId] as const,
  );
  if (status !== 204 && status !== 404) {
    throw new Error(
      `${what} cleanup failed: expected 204/404, received ${status}.`,
    );
  }
}

async function deleteServiceViaApi(page: Page, id: string) {
  await deleteViaApi(
    page,
    `/api/services/${encodeURIComponent(id)}`,
    `Service ${id}`,
  );
}

async function deleteServiceLabelViaApi(page: Page, id: string) {
  await deleteViaApi(
    page,
    `/api/services/labels/${encodeURIComponent(id)}`,
    `Service label ${id}`,
  );
}

// Creates a label through the "Управление метками" dialog and returns its id.
async function createLabel(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Управление метками", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Создать метку", exact: true })
    .click();
  await dialog.getByLabel("Название метки", { exact: true }).fill(name);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/services/labels" &&
      response.request().method() === "POST"
    );
  });
  await dialog
    .getByRole("button", { name: "Создать метку", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    throw new Error("Label POST response must contain a string id.");
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return body.id;
}

// Toggles a label inside an already-open label picker popover.
async function toggleLabelOption(page: Page, name: string) {
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.keyboard.press("Escape");
}

test("creating an HTTP service persists it and it appears in the list without a full reload", async ({
  page,
  testData,
}) => {
  const name = testData.name("Uptime Probe");
  const url = testData.localUrl("/login");
  let id: string | undefined;
  try {
    await page.goto("/services");
    id = await createHttpService(page, { name, url });

    const card = serviceCard(page, name);
    await expect(card).toBeVisible();
    await expect(card.getByText("HTTP(S)", { exact: false })).toBeVisible();
  } finally {
    if (id) await deleteServiceViaApi(page, id);
  }
});

test("service cards preserve actions and heading hierarchy across tablet and desktop widths", async ({
  page,
  testData,
}) => {
  const names = [
    testData.name("Layout Service A"),
    testData.name("Layout Service B"),
    testData.name("Layout Service C"),
  ];
  const ids: string[] = [];

  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/services");

    for (const name of names) {
      ids.push(
        await createHttpService(page, {
          name,
          url: testData.localUrl("/login"),
        }),
      );
    }

    await expect(
      page.getByRole("heading", { name: "Сервисы", exact: true, level: 1 }),
    ).toBeVisible();

    for (const name of names) {
      const card = serviceCard(page, name);
      const cardBox = await card.boundingBox();
      if (!cardBox) throw new Error(`Service card «${name}» is not visible.`);
      expect(cardBox.width).toBeGreaterThanOrEqual(288);
      await expect(
        card.getByRole("heading", { name, exact: true, level: 2 }),
      ).toBeVisible();
      await expect(
        card.getByText("История проверок", { exact: true }),
      ).toBeVisible();
      await expectInsideHorizontally(
        card,
        card.getByRole("button", { name: "Проверить сейчас", exact: true }),
      );
      await expectInsideHorizontally(
        card,
        card.getByRole("button", { name: "Приостановить", exact: true }),
      );
      await expectInsideHorizontally(
        card,
        card.getByRole("button", {
          name: `Редактировать «${name}»`,
          exact: true,
        }),
      );
      await expectInsideHorizontally(
        card,
        card.getByRole("button", {
          name: `Удалить «${name}»`,
          exact: true,
        }),
      );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const grid = serviceCard(page, names[0]).locator("..");
    await expect
      .poll(() =>
        grid.evaluate(
          (element) =>
            getComputedStyle(element)
              .gridTemplateColumns.split(/\s+/)
              .filter(Boolean).length,
        ),
      )
      .toBe(3);
  } finally {
    for (const id of ids) await deleteServiceViaApi(page, id);
  }
});

test("submitting the create form without a URL shows a validation error and creates nothing", async ({
  page,
  testData,
}) => {
  const name = testData.name("No URL Service");
  await page.goto("/services");

  await page.getByRole("button", { name: "Новый сервис", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(page.getByText("URL обязателен.")).toBeVisible();
  await expect(serviceCard(page, name)).toHaveCount(0);
});

test("editing a service persists field changes", async ({ page, testData }) => {
  const originalName = testData.name("Editable Service");
  const editedName = testData.name("Editable Service Renamed");
  const url = testData.localUrl("/login");
  let id: string | undefined;
  try {
    await page.goto("/services");
    id = await createHttpService(page, { name: originalName, url });

    await serviceCard(page, originalName)
      .getByRole("button", {
        name: `Редактировать «${originalName}»`,
        exact: true,
      })
      .click();
    await page.getByLabel("Название", { exact: true }).fill(editedName);

    const responsePromise = page.waitForResponse((response) => {
      const respUrl = new URL(response.url());
      return (
        respUrl.pathname === `/api/services/${id}` &&
        response.request().method() === "PATCH"
      );
    });
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect(serviceCard(page, editedName)).toBeVisible();
    await expect(serviceCard(page, originalName)).toHaveCount(0);
  } finally {
    if (id) await deleteServiceViaApi(page, id);
  }
});

test("the detail page renders the service configuration", async ({
  page,
  testData,
}) => {
  const name = testData.name("Detail View Service");
  const url = testData.localUrl("/login");
  let id: string | undefined;
  try {
    await page.goto("/services");
    id = await createHttpService(page, { name, url });

    await page.goto(`/services/${id}`);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("HTTP(S)", { exact: true })).toBeVisible();
    await expect(page.getByText(url, { exact: true })).toBeVisible();
  } finally {
    if (id) await deleteServiceViaApi(page, id);
  }
});

test("'Проверить сейчас' on the detail page triggers the check-now API call and updates lastCheckedAt", async ({
  page,
  testData,
}) => {
  const name = testData.name("Check Now Service");
  const url = testData.localUrl("/login");
  let id: string | undefined;
  try {
    await page.goto("/services");
    id = await createHttpService(page, { name, url });

    await page.goto(`/services/${id}`);

    const responsePromise = page.waitForResponse((response) => {
      const respUrl = new URL(response.url());
      return (
        respUrl.pathname === `/api/services/${id}/check-now` &&
        response.request().method() === "POST"
      );
    });
    await page
      .getByRole("button", { name: "Проверить сейчас", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("lastCheckedAt" in body)
    ) {
      throw new Error("check-now response must include lastCheckedAt.");
    }
    expect(body.lastCheckedAt).not.toBeNull();
    expect(typeof body.lastCheckedAt).toBe("string");
  } finally {
    if (id) await deleteServiceViaApi(page, id);
  }
});

test("labels can be created, assigned in the form, and used to filter the list", async ({
  page,
  testData,
}) => {
  const labelName = testData.name("Prod");
  const labeledName = testData.name("Labeled Service");
  const plainName = testData.name("Plain Service");
  const url = testData.localUrl("/login");
  const serviceIds: string[] = [];
  let labelId: string | undefined;

  try {
    await page.goto("/services");
    serviceIds.push(await createHttpService(page, { name: labeledName, url }));
    serviceIds.push(await createHttpService(page, { name: plainName, url }));

    labelId = await createLabel(page, labelName);

    // Assign the label through the service edit form.
    await serviceCard(page, labeledName)
      .getByRole("button", {
        name: `Редактировать «${labeledName}»`,
        exact: true,
      })
      .click();
    const formDialog = page.getByRole("dialog");
    await formDialog
      .getByRole("button", { name: "Выбрать метки", exact: true })
      .click();
    await toggleLabelOption(page, labelName);

    const patchPromise = page.waitForResponse((response) => {
      const respUrl = new URL(response.url());
      return (
        respUrl.pathname === `/api/services/${serviceIds[0]}` &&
        response.request().method() === "PATCH"
      );
    });
    await formDialog
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    expect((await patchPromise).status()).toBe(200);

    // The chip shows up on the card once the list re-renders.
    const labeledCard = serviceCard(page, labeledName);
    await expect(labeledCard.getByTitle(labelName)).toBeVisible();
    await expect(
      serviceCard(page, plainName).getByTitle(labelName),
    ).toHaveCount(0);

    // Filtering by that label keeps the labeled service and drops the other.
    await page.getByRole("button", { name: "Метки", exact: true }).click();
    await toggleLabelOption(page, labelName);
    await expect(labeledCard).toBeVisible();
    await expect(serviceCard(page, plainName)).toHaveCount(0);

    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .first()
      .click();
    await expect(serviceCard(page, plainName)).toBeVisible();

    // Text search narrows the list down to a single card.
    await page.getByLabel("Поиск сервисов", { exact: true }).fill(plainName);
    await expect(serviceCard(page, plainName)).toBeVisible();
    await expect(labeledCard).toHaveCount(0);
  } finally {
    if (labelId) await deleteServiceLabelViaApi(page, labelId);
    for (const id of serviceIds) await deleteServiceViaApi(page, id);
  }
});

test("pausing a service from its card stops the scheduled checks and reports it as suspended", async ({
  page,
  testData,
}) => {
  const name = testData.name("Pausable Service");
  const url = testData.localUrl("/login");
  let id: string | undefined;
  try {
    await page.goto("/services");
    id = await createHttpService(page, { name, url });
    const card = serviceCard(page, name);

    const pausePromise = page.waitForResponse((response) => {
      const respUrl = new URL(response.url());
      return (
        respUrl.pathname === `/api/services/${id}` &&
        response.request().method() === "PATCH"
      );
    });
    await card
      .getByRole("button", { name: "Приостановить", exact: true })
      .click();
    const pauseResponse = await pausePromise;
    expect(pauseResponse.status()).toBe(200);

    const paused: unknown = await pauseResponse.json();
    if (
      typeof paused !== "object" ||
      paused === null ||
      !("isActive" in paused)
    ) {
      throw new Error("PATCH response must include isActive.");
    }
    expect(paused.isActive).toBe(false);

    // The card must stop claiming the last known result once nothing is
    // refreshing it.
    await expect(
      card.getByText("Приостановлен", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Возобновить", exact: true }),
    ).toBeVisible();

    const resumePromise = page.waitForResponse((response) => {
      const respUrl = new URL(response.url());
      return (
        respUrl.pathname === `/api/services/${id}` &&
        response.request().method() === "PATCH"
      );
    });
    await card
      .getByRole("button", { name: "Возобновить", exact: true })
      .click();
    expect((await resumePromise).status()).toBe(200);

    await expect(
      card.getByRole("button", { name: "Приостановить", exact: true }),
    ).toBeVisible();
    await expect(card.getByText("Приостановлен", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    if (id) await deleteServiceViaApi(page, id);
  }
});

test("deleting a service removes it from the list without a full reload", async ({
  page,
  testData,
}) => {
  const name = testData.name("Deletable Service");
  const url = testData.localUrl("/login");
  await page.goto("/services");
  const id = await createHttpService(page, { name, url });

  await serviceCard(page, name)
    .getByRole("button", { name: `Удалить «${name}»`, exact: true })
    .click();
  await expect(
    page.getByText(`Удалить «${name}»?`, { exact: true }),
  ).toBeVisible();

  const responsePromise = page.waitForResponse((response) => {
    const respUrl = new URL(response.url());
    return (
      respUrl.pathname === `/api/services/${id}` &&
      response.request().method() === "DELETE"
    );
  });
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(204);

  await expect(serviceCard(page, name)).toHaveCount(0);
});
