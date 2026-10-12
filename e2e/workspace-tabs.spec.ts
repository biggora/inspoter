import type { Browser, Page, Request } from "@playwright/test";
import { Client } from "pg";

import enShell from "../src/messages/en/shell.json";
import enWorkspace from "../src/messages/en/workspace.json";
import ruShell from "../src/messages/ru/shell.json";
import ruWorkspace from "../src/messages/ru/workspace.json";
import { expect, test as base } from "./fixtures/test";
import { login, OPERATOR_USERNAME, submitLoginForm } from "./utils/auth";

// Workspace-in-URL, Slice 3 (docs/plans/workspace-in-url.md §6, AC-WS-009,
// 010, 012..015): the workspace of a tab is the `/w/<slug>` segment, tabs of
// one session are independent, and un-prefixed URLs redirect into a workspace.

const EXTRA_OPERATOR_PASSWORD = "e2e-workspace-tabs-password";

interface Workspace {
  id: string;
  slug: string;
  name: string;
}

interface ApiResult<T> {
  status: number;
  body: T;
}

const LOCALES = [
  { id: "en", prefix: "", shell: enShell, workspace: enWorkspace },
  { id: "ru", prefix: "/ru", shell: ruShell, workspace: ruWorkspace },
] as const;

function databaseClient(): Client {
  const url = new URL(process.env.DATABASE_URL ?? "");
  // The destructive statements below only ever run against the local E2E
  // database that playwright.config.ts validated.
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refusing to touch a non-local database: ${url.hostname}`);
  }
  url.search = "";
  return new Client({ connectionString: url.toString() });
}

async function sql(text: string, params: unknown[] = []) {
  const client = databaseClient();
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

// Every workspace and operator this file creates is named `<base>-<suffix>`
// (testData.name). The suffix is stable between runs, so rows left behind by a
// crashed run are also removed before the next one starts.
async function purgeCreatedRows(suffix: string) {
  const pattern = `%-${suffix}`;
  await sql(`DELETE FROM "Workspace" WHERE "name" LIKE $1`, [pattern]);
  await sql(`DELETE FROM "Operator" WHERE "username" LIKE $1`, [pattern]);
}

const test = base.extend<{ createdRows: void }>({
  createdRows: [
    async ({ testData }, provide) => {
      await purgeCreatedRows(testData.suffix);
      await provide();
      await purgeCreatedRows(testData.suffix);
    },
    { auto: true },
  ],
});

test.describe.configure({ timeout: 60_000 });

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

function atPath(pathname: string, search = "") {
  return (url: URL) => url.pathname === pathname && url.search === search;
}

function slugOf(page: Page): string {
  const match = /^\/(?:ru\/)?w\/([^/]+)/.exec(new URL(page.url()).pathname);
  if (!match) throw new Error(`Not a workspace URL: ${page.url()}`);
  return match[1]!;
}

async function api<T = unknown>(
  page: Page,
  workspaceId: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const result = await page.evaluate(
    async ([wsId, requestMethod, requestPath, requestBody]) => {
      const headers: Record<string, string> = {};
      if (wsId !== null) headers["x-inspoter-workspace"] = wsId;
      if (requestBody !== null) headers["Content-Type"] = "application/json";
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers,
        body: requestBody === null ? undefined : JSON.stringify(requestBody),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // Keep the raw text.
      }
      return { status: response.status, body: parsed };
    },
    [workspaceId, method, path, body ?? null] as const,
  );
  return result as ApiResult<T>;
}

// Next prefetches the sidebar links shortly after a page hydrates, and a
// prefetch of a workspace page runs its layout, which records that workspace
// as last-used. A tab's burst of prefetches can therefore land after another
// tab's render and overwrite last-used. Tests that read last-used wait for the
// burst to end first.
async function settled(page: Page) {
  let lastPrefetch = Date.now();
  const onRequest = (request: Request) => {
    if (request.headers()["next-router-prefetch"]) lastPrefetch = Date.now();
  };
  page.on("request", onRequest);
  try {
    await expect
      .poll(() => Date.now() - lastPrefetch, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1000);
  } finally {
    page.off("request", onRequest);
  }
}

async function visit(
  page: Page,
  path: string,
  options?: Parameters<Page["goto"]>[1],
) {
  const response = await page.goto(path, options);
  await settled(page);
  return response;
}

// Signs in and returns the workspace the sign-in landed on (the e2e operator's
// own workspace, "home").
async function signIn(page: Page): Promise<Workspace> {
  await login(page);
  await expect(page).toHaveURL(/\/w\/[^/]+\/management$/);
  const trigger = page.locator("button[data-workspace-id]");
  const id = await trigger.getAttribute("data-workspace-id");
  if (!id) throw new Error("The home workspace id is required.");
  await settled(page);
  return { id, slug: slugOf(page), name: "" };
}

async function createWorkspace(
  page: Page,
  headerWorkspaceId: string,
  name: string,
): Promise<Workspace> {
  const result = await api<Workspace>(
    page,
    headerWorkspaceId,
    "POST",
    "/api/workspaces",
    { name },
  );
  expect(result.status).toBe(201);
  return result.body;
}

async function createNote(page: Page, workspace: Workspace, title: string) {
  const result = await api<{ id: string }>(
    page,
    workspace.id,
    "POST",
    "/api/notes",
    { title, folderId: null },
  );
  expect(result.status).toBe(201);
  return result.body;
}

async function noteTitles(page: Page, workspace: Workspace) {
  const result = await api<{ items: Array<{ title: string }> }>(
    page,
    workspace.id,
    "GET",
    "/api/notes",
  );
  expect(result.status).toBe(200);
  return result.body.items.map((note) => note.title);
}

// A workspace the e2e operator is not a member of: another operator logs in
// and creates it. Both rows are removed by `createdRows`.
async function createForeignWorkspace(
  browser: Browser,
  baseURL: string | undefined,
  page: Page,
  home: Workspace,
  suffixName: (base: string) => string,
): Promise<Workspace> {
  const username = suffixName("foreign-owner");
  const added = await api(
    page,
    home.id,
    "POST",
    `/api/workspaces/${home.id}/members`,
    { username, password: EXTRA_OPERATOR_PASSWORD },
  );
  expect(added.status).toBe(201);

  const context = await browser.newContext({ baseURL });
  try {
    const otherPage = await context.newPage();
    await login(otherPage, username, EXTRA_OPERATOR_PASSWORD);
    return await createWorkspace(otherPage, home.id, suffixName("Foreign"));
  } finally {
    await context.close();
  }
}

async function expectWorkspaceShown(page: Page, workspace: Workspace) {
  const trigger = page.locator("button[data-workspace-id]");
  await expect(trigger).toHaveAttribute("data-workspace-id", workspace.id);
  await expect(trigger).toHaveText(workspace.name);
}

async function createNoteInUi(page: Page, title: string) {
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New note", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/);
  await expect(
    page.getByRole("main").getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(title);
  await settled(page);
}

async function expectWorkspaceNotFound(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(404);
  const heading = page.getByRole("heading", {
    name: "Workspace not found",
    level: 1,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  // No shell and no workspace data.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("[data-workspace-id]")).toHaveCount(0);
  return {
    title: await page.title(),
    main: await page.getByRole("main").innerText(),
  };
}

test.describe("independent tabs (AC-WS-009, AC-WS-012)", () => {
  test("two tabs of one session read and write only their own workspace", async ({
    page,
    context,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Tab A"));
    const b = await createWorkspace(page, home.id, testData.name("Tab B"));
    const noteA1 = testData.name("Note A1");
    const noteA2 = testData.name("Note A2");
    const noteB1 = testData.name("Note B1");

    await visit(page, `/w/${a.slug}/notes`);
    const pageB = await context.newPage();
    await visit(pageB, `/w/${b.slug}/notes`);
    await expectWorkspaceShown(page, a);
    await expectWorkspaceShown(pageB, b);

    await createNoteInUi(page, noteA1);
    await createNoteInUi(pageB, noteB1);
    // Tab B rendered last, so B is the last-used workspace, yet tab A still
    // writes to A.
    const lastUsed = await page.request.get("/notes", { maxRedirects: 0 });
    expect(lastUsed.headers()["location"]).toContain(`/w/${b.slug}/notes`);
    await createNoteInUi(page, noteA2);
    await expect(page).toHaveURL(new RegExp(`/w/${a.slug}/notes/[^/]+$`));

    // Every write went to the workspace of the tab that made it.
    expect((await noteTitles(page, a)).sort()).toEqual([noteA1, noteA2]);
    expect(await noteTitles(page, b)).toEqual([noteB1]);

    // Each tab reads only its own workspace, before and after a reload.
    for (const tab of [page, pageB]) {
      await tab.reload();
      await settled(tab);
    }
    await expectWorkspaceShown(page, a);
    await expectWorkspaceShown(pageB, b);
    for (const title of [noteA1, noteA2]) {
      await expect(
        page.getByRole("treeitem", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        pageB.getByRole("treeitem", { name: title, exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      pageB.getByRole("treeitem", { name: noteB1, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("treeitem", { name: noteB1, exact: true }),
    ).toHaveCount(0);
    await pageB.close();
  });

  test("last-used follows the latest workspace render and never moves an open tab", async ({
    page,
    context,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Used A"));
    const b = await createWorkspace(page, home.id, testData.name("Used B"));

    await visit(page, `/w/${a.slug}/management`);
    const pageB = await context.newPage();
    await visit(pageB, `/w/${b.slug}/management`);

    const probe = await context.newPage();
    await probe.goto("/notes");
    await expect(probe).toHaveURL(atPath(`/w/${b.slug}/notes`));
    await settled(probe);

    // Tab A renders a page of A again, which makes A the last-used one.
    await page.getByRole("link", { name: "Notes", exact: true }).click();
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));
    await settled(page);
    await probe.goto("/notes");
    await expect(probe).toHaveURL(atPath(`/w/${a.slug}/notes`));

    // Tab B kept its workspace although A is now the last-used one.
    await pageB.reload();
    await expectWorkspaceShown(pageB, b);
    await expect(pageB).toHaveURL(atPath(`/w/${b.slug}/management`));
    await probe.close();
    await pageB.close();
  });
});

test.describe("legacy URLs (AC-WS-014)", () => {
  test("a prefix-less URL redirects to the last-used workspace with a 307", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Legacy A"));
    await visit(page, `/w/${a.slug}/management`);

    const redirect = await page.request.get("/notes", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(new URL(redirect.headers()["location"]!, page.url()).pathname).toBe(
      `/w/${a.slug}/notes`,
    );

    await page.goto("/notes");
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));
    await expectWorkspaceShown(page, { ...a });
  });

  test("a locale prefix and the query string survive the redirect", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Legacy Q"));
    await visit(page, `/w/${a.slug}/management`);

    await page.goto("/ru/kanban?x=1");
    await expect(page).toHaveURL(atPath(`/ru/w/${a.slug}/kanban`, "?x=1"));
  });

  test("percent-encoded paths and queries are redirected without double encoding", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Legacy E"));
    await visit(page, `/w/${a.slug}/management`);

    const expectRedirect = async (path: string, expected: string) => {
      const redirect = await page.request.get(path, { maxRedirects: 0 });
      expect(redirect.status(), path).toBe(307);
      const target = new URL(redirect.headers()["location"]!, page.url());
      expect(`${target.pathname}${target.search}`, path).toBe(expected);
      expect(target.href, path).not.toContain("%25");
    };

    await expectRedirect("/notes/caf%C3%A9", `/w/${a.slug}/notes/caf%C3%A9`);
    await expectRedirect("/notes/a%20b", `/w/${a.slug}/notes/a%20b`);
    await expectRedirect(
      "/kanban?x=caf%C3%A9",
      `/w/${a.slug}/kanban?x=caf%C3%A9`,
    );
    await page.goto("/notes/caf%C3%A9");
    expect(new URL(page.url()).pathname).toBe(`/w/${a.slug}/notes/caf%C3%A9`);

    // The locale prefix goes last: requesting it makes the locale cookie stick.
    await expectRedirect(
      "/ru/notes/caf%C3%A9",
      `/ru/w/${a.slug}/notes/caf%C3%A9`,
    );
  });

  test("a deep legacy path keeps its segments", async ({ page, testData }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Legacy D"));
    await visit(page, `/w/${a.slug}/management`);

    await page.goto("/settings/workspace");
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/settings/workspace`));
  });

  test("a Referer inside a member workspace wins over last-used, a foreign one does not", async ({
    page,
    browser,
    baseURL,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Ref A"));
    const b = await createWorkspace(page, home.id, testData.name("Ref B"));
    const foreign = await createForeignWorkspace(
      browser,
      baseURL,
      page,
      home,
      testData.name,
    );

    await visit(page, `/w/${a.slug}/management`);
    await visit(page, "/notes", {
      referer: testData.localUrl(`/w/${b.slug}/management`),
    });
    await expect(page).toHaveURL(atPath(`/w/${b.slug}/notes`));

    // The Referer carries a locale prefix too.
    await visit(page, `/w/${a.slug}/management`);
    await visit(page, "/notes", {
      referer: testData.localUrl(`/ru/w/${b.slug}/management`),
    });
    await expect(page).toHaveURL(atPath(`/w/${b.slug}/notes`));

    await visit(page, `/w/${a.slug}/management`);
    await visit(page, "/notes", {
      referer: testData.localUrl(`/w/${foreign.slug}/management`),
    });
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));

    // A cross-origin Referer is ignored as well.
    await visit(page, "/notes", {
      referer: `https://example.com/w/${b.slug}/management`,
    });
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));
  });

  test("a first segment that is not a section keeps the global 404", async ({
    page,
  }) => {
    await login(page);
    for (const path of [
      "/not-a-section",
      "/not-a-section/deeper/path",
      "/ru/not-a-section",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(
        page.getByRole("heading", { name: "Page not found", level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Go to sign in" }),
      ).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(0);
      expect(new URL(page.url()).pathname, path).toBe(path);
    }
  });

  test("login and the root entry points end on the workspace management page", async ({
    page,
  }) => {
    const home = await signIn(page);
    await expect(page).toHaveURL(atPath(`/w/${home.slug}/management`));

    await page.goto("/");
    await expect(page).toHaveURL(atPath(`/w/${home.slug}/management`));

    await page.goto("/ru");
    await expect(page).toHaveURL(atPath(`/ru/w/${home.slug}/management`));
  });

  test("an operator without any membership is sent to /no-workspace", async ({
    page,
    browser,
    baseURL,
    testData,
  }) => {
    const home = await signIn(page);
    const username = testData.name("no-membership");
    const added = await api<{ id: string }>(
      page,
      home.id,
      "POST",
      `/api/workspaces/${home.id}/members`,
      { username, password: EXTRA_OPERATOR_PASSWORD },
    );
    expect(added.status).toBe(201);
    const removed = await api(
      page,
      home.id,
      "DELETE",
      `/api/workspaces/${home.id}/members/${added.body.id}`,
    );
    expect(removed.status).toBe(204);

    const context = await browser.newContext({ baseURL });
    try {
      const other = await context.newPage();
      await submitLoginForm(other, username, EXTRA_OPERATOR_PASSWORD);
      await expect(other).toHaveURL(atPath("/no-workspace"));
      await expect(
        other.getByRole("heading", { name: "No workspace access" }),
      ).toBeVisible();

      // A workspace the operator never belonged to is not found either.
      await expectWorkspaceNotFound(other, `/w/${home.slug}/notes`);

      // The locale prefix goes last: visiting it makes the locale cookie stick.
      for (const [path, landing] of [
        ["/notes", "/no-workspace"],
        ["/", "/no-workspace"],
        ["/ru/kanban?x=1", "/ru/no-workspace"],
      ] as const) {
        await other.goto(path);
        await expect(other, path).toHaveURL(atPath(landing));
      }
    } finally {
      await context.close();
    }
  });
});

test.describe("unknown and foreign workspaces (AC-WS-013)", () => {
  test("a foreign slug and an unknown slug render the same shell-less 404", async ({
    page,
    browser,
    baseURL,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("NotFound A"));
    const foreign = await createForeignWorkspace(
      browser,
      baseURL,
      page,
      home,
      testData.name,
    );
    await visit(page, `/w/${a.slug}/management`);

    const foreignNotes = await expectWorkspaceNotFound(
      page,
      `/w/${foreign.slug}/notes`,
    );
    const unknownNotes = await expectWorkspaceNotFound(page, "/w/nope/notes");
    expect(unknownNotes).toEqual(foreignNotes);

    const foreignRoot = await expectWorkspaceNotFound(
      page,
      `/w/${foreign.slug}`,
    );
    const unknownRoot = await expectWorkspaceNotFound(page, "/w/nope");
    expect(unknownRoot).toEqual(foreignRoot);
    expect(foreignRoot).toEqual(foreignNotes);

    // Neither request changed the last-used workspace.
    await page.goto("/notes");
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));
  });

  test("the 404 offers a way back to the operator's own workspace", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Back A"));
    await visit(page, `/w/${a.slug}/management`);

    await expectWorkspaceNotFound(page, "/w/nope/notes");
    await page.getByRole("link", { name: "Go to my workspace" }).click();
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/management`));
  });

  test("an unknown section inside a member workspace gets the global 404, not the workspace one", async ({
    page,
  }) => {
    const home = await signIn(page);
    const response = await page.goto(`/w/${home.slug}/does-not-exist`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Workspace not found" }),
    ).toHaveCount(0);
  });

  test("the workspace root opens the management page", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Root A"));

    await page.goto(`/w/${a.slug}`);
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/management`));
    await page.goto(`/ru/w/${a.slug}`);
    await expect(page).toHaveURL(atPath(`/ru/w/${a.slug}/management`));
  });
});

for (const locale of LOCALES) {
  test.describe(`workspace switcher, ${locale.id} (AC-WS-010)`, () => {
    const triggerName = (name: string) =>
      fill(locale.shell.workspaceLabel, { name });

    test("an entry navigates this tab to the same section root of the other workspace and leaves other tabs alone", async ({
      page,
      context,
      testData,
    }) => {
      const home = await signIn(page);
      const a = await createWorkspace(page, home.id, testData.name("Switch A"));
      const b = await createWorkspace(page, home.id, testData.name("Switch B"));
      const note = await createNote(page, a, testData.name("Switch note"));

      const otherTab = await context.newPage();
      await otherTab.goto(`${locale.prefix}/w/${a.slug}/notes`);
      await page.goto(`${locale.prefix}/w/${a.slug}/notes/${note.id}`);
      await page
        .getByRole("button", { name: triggerName(a.name), exact: true })
        .click();
      await page.getByRole("menuitem", { name: b.name, exact: true }).click();

      await expect(page).toHaveURL(
        atPath(`${locale.prefix}/w/${b.slug}/notes`),
      );
      await expectWorkspaceShown(page, b);
      await expect(
        page.getByRole("button", { name: triggerName(b.name), exact: true }),
      ).toBeVisible();

      // A section without an id keeps its root, and the other tab is intact.
      await page.goto(`${locale.prefix}/w/${b.slug}/settings/workspace`);
      await page
        .getByRole("button", { name: triggerName(b.name), exact: true })
        .click();
      await page.getByRole("menuitem", { name: a.name, exact: true }).click();
      await expect(page).toHaveURL(
        atPath(`${locale.prefix}/w/${a.slug}/settings`),
      );

      await otherTab.reload();
      await expectWorkspaceShown(otherTab, a);
      await expect(otherTab).toHaveURL(
        atPath(`${locale.prefix}/w/${a.slug}/notes`),
      );
      await otherTab.close();
    });

    test("an entry is a link that opens in a new tab", async ({
      page,
      context,
      testData,
    }) => {
      const home = await signIn(page);
      const a = await createWorkspace(
        page,
        home.id,
        testData.name("Tab link A"),
      );
      const b = await createWorkspace(
        page,
        home.id,
        testData.name("Tab link B"),
      );
      const note = await createNote(page, a, testData.name("Tab link note"));
      const sourcePath = `${locale.prefix}/w/${a.slug}/notes/${note.id}`;

      await page.goto(sourcePath);
      for (const mode of ["ctrl", "middle"] as const) {
        await page
          .getByRole("button", { name: triggerName(a.name), exact: true })
          .click();
        const item = page.getByRole("menuitem", { name: b.name, exact: true });
        await expect(item).toHaveAttribute(
          "href",
          `${locale.prefix}/w/${b.slug}/notes`,
        );

        const opened = context.waitForEvent("page");
        if (mode === "ctrl") {
          await item.click({ modifiers: ["ControlOrMeta"] });
        } else {
          await item.click({ button: "middle" });
        }
        const newTab = await opened;
        await newTab.waitForLoadState();
        await expect(newTab, mode).toHaveURL(
          atPath(`${locale.prefix}/w/${b.slug}/notes`),
        );
        await expectWorkspaceShown(newTab, b);
        await newTab.close();

        // The tab that was clicked stays on its own workspace.
        await expect(page).toHaveURL(atPath(sourcePath));
        await expectWorkspaceShown(page, a);
        // A modified or middle click leaves this tab where it is, so the menu
        // closes instead of waiting for a navigation that never comes.
        await expect(item, mode).toBeHidden();
      }
    });

    test("creating a workspace from the switcher opens its management page", async ({
      page,
      testData,
    }) => {
      const home = await signIn(page);
      const a = await createWorkspace(page, home.id, testData.name("Create A"));
      const created = testData.name("Created from switcher");

      await page.goto(`${locale.prefix}/w/${a.slug}/notes`);
      await page
        .getByRole("button", { name: triggerName(a.name), exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: locale.shell.createWorkspace })
        .click();
      const dialog = page.getByRole("dialog", {
        name: locale.shell.createWorkspace,
        exact: true,
      });
      await dialog
        .getByLabel(locale.shell.workspaceNameFieldLabel, { exact: true })
        .fill(created);
      await dialog
        .getByRole("button", { name: locale.shell.create, exact: true })
        .click();

      await expect(page).toHaveURL(
        (url) =>
          url.pathname.startsWith(`${locale.prefix}/w/`) &&
          url.pathname.endsWith("/management") &&
          !url.pathname.includes(`/w/${a.slug}/`),
      );
      await expect(
        page.getByRole("button", { name: triggerName(created), exact: true }),
      ).toBeVisible();
    });

    test("creating a workspace in settings opens that workspace's settings and lists it in the switcher", async ({
      page,
      testData,
    }) => {
      const home = await signIn(page);
      const a = await createWorkspace(page, home.id, testData.name("Form A"));
      const created = testData.name("Created in settings");

      await page.goto(`${locale.prefix}/w/${a.slug}/settings/workspace`);
      await page
        .getByLabel(locale.workspace.newWorkspaceNameLabel, { exact: true })
        .fill(created);
      await page
        .getByRole("button", {
          name: locale.workspace.createWorkspaceButton,
          exact: true,
        })
        .click();

      await expect(page).toHaveURL((url) =>
        new RegExp(
          `^${locale.prefix}/w/(?!${a.slug}/)[^/]+/settings/workspace$`,
        ).test(url.pathname),
      );
      expect(slugOf(page)).not.toBe(a.slug);
      await expect(
        page.getByLabel(locale.workspace.nameLabel, { exact: true }),
      ).toHaveValue(created);

      await page
        .getByRole("button", { name: triggerName(created), exact: true })
        .click();
      await expect(
        page.getByRole("menuitem", { name: created, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: a.name, exact: true }),
      ).toBeVisible();
    });

    test("removing yourself from a workspace leaves it without ending on a 404", async ({
      page,
      testData,
    }) => {
      const home = await signIn(page);
      const b = await createWorkspace(page, home.id, testData.name("Leave B"));
      const secondOwner = testData.name("second-owner");
      const added = await api<{ id: string }>(
        page,
        b.id,
        "POST",
        `/api/workspaces/${b.id}/members`,
        { username: secondOwner, password: EXTRA_OPERATOR_PASSWORD },
      );
      expect(added.status).toBe(201);
      // Members join as MEMBER and no API promotes them, but leaving an
      // OWNER seat requires another owner.
      await sql(
        `UPDATE "WorkspaceMember" SET "role" = 'OWNER' WHERE "id" = $1`,
        [added.body.id],
      );

      await page.goto(`${locale.prefix}/w/${b.slug}/settings/workspace`);
      await page
        .getByRole("button", {
          name: fill(locale.workspace.removeMemberLabel, {
            name: OPERATOR_USERNAME,
          }),
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("alertdialog", {
          name: fill(locale.workspace.confirmRemoveTitle, {
            name: OPERATOR_USERNAME,
          }),
        }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: locale.workspace.removeButton,
          exact: true,
        })
        .click();

      await expect(page).toHaveURL(
        (url) =>
          /^\/(?:ru\/)?w\/[^/]+\/management$/.test(url.pathname) &&
          url.pathname.startsWith(locale.prefix || "/") &&
          !url.pathname.includes(`/w/${b.slug}/`),
      );
      if (locale.prefix) {
        expect(new URL(page.url()).pathname.startsWith("/ru/")).toBe(true);
      } else {
        expect(new URL(page.url()).pathname.startsWith("/ru")).toBe(false);
      }
      await expect(
        page.getByRole("heading", { name: "Workspace not found" }),
      ).toHaveCount(0);
      await expect(page.locator("button[data-workspace-id]")).toBeVisible();
      const remaining = await api<{ workspaces: Workspace[] }>(
        page,
        await page
          .locator("button[data-workspace-id]")
          .getAttribute("data-workspace-id"),
        "GET",
        "/api/workspaces",
      );
      expect(remaining.body.workspaces.map((w) => w.id)).not.toContain(b.id);
    });
  });
}

test.describe("language switch", () => {
  test("switching the language keeps the workspace in the URL", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Lang A"));

    await page.goto(`/w/${a.slug}/notes`);
    await page
      .getByRole("button", { name: enShell.languageSwitcherLabel, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Русский" }).click();
    await expect(page).toHaveURL(atPath(`/ru/w/${a.slug}/notes`));
    await expectWorkspaceShown(page, a);

    await page
      .getByRole("button", { name: ruShell.languageSwitcherLabel, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await expect(page).toHaveURL(atPath(`/w/${a.slug}/notes`));
    await expectWorkspaceShown(page, a);
  });
});

test.describe("API workspace selector (AC-WS-015)", () => {
  test("the header selects a member workspace, whichever tab sends it", async ({
    page,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Api A"));
    const b = await createWorkspace(page, home.id, testData.name("Api B"));
    const noteA = testData.name("Api note A");
    const noteB = testData.name("Api note B");
    await createNote(page, a, noteA);
    await createNote(page, b, noteB);

    await page.goto(`/w/${a.slug}/notes`);
    // Tab A sends B's id and gets B's data, and vice versa.
    expect(await noteTitles(page, b)).toEqual([noteB]);
    expect(await noteTitles(page, a)).toEqual([noteA]);

    // A write with B's header lands in B only.
    const written = testData.name("Api note written to B");
    await createNote(page, b, written);
    expect(await noteTitles(page, a)).toEqual([noteA]);
    expect((await noteTitles(page, b)).sort()).toEqual([noteB, written].sort());
  });

  test("a foreign id and an unknown id get the same 403, a missing or malformed header gets 400", async ({
    page,
    browser,
    baseURL,
    testData,
  }) => {
    const home = await signIn(page);
    const a = await createWorkspace(page, home.id, testData.name("Deny A"));
    const foreign = await createForeignWorkspace(
      browser,
      baseURL,
      page,
      home,
      testData.name,
    );
    await page.goto(`/w/${a.slug}/notes`);

    const denied = await api(page, foreign.id, "GET", "/api/notes");
    const unknown = await api(
      page,
      "no-such-workspace-id",
      "GET",
      "/api/notes",
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: "WORKSPACE_ACCESS_DENIED" });
    expect(unknown).toEqual(denied);

    // A write is refused the same way and creates nothing in the foreign one.
    const write = await api(page, foreign.id, "POST", "/api/notes", {
      title: testData.name("Must not exist"),
      folderId: null,
    });
    expect(write).toEqual(denied);

    for (const header of [null, "", "a".repeat(129)]) {
      const result = await api(page, header, "GET", "/api/notes");
      expect(result.status, JSON.stringify(header)).toBe(400);
    }
    // The workspace of the tab is unaffected by the refused requests.
    expect(await noteTitles(page, a)).toEqual([]);
  });
});
