import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";

// Slice 3 of docs/plans/workspace-in-url.md (AC-WS-014): un-prefixed URLs are
// redirected to /w/<slug>/<same path and query>. The slug comes from a
// same-origin Referer the operator is a member of, else from last-used. The
// project-wide mocks (tests/setup.integration.ts) make the locale-aware
// `redirect` throw `redirect to <href> with locale <locale>` and getLocale()
// answer "ru".

let seededSessionId = "";
let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
  headers: async () => requestHeaders,
}));

const PREFIX = `legacy-${randomUUID()}`;
const HOST = "inspoter.test";
let operatorId: string;
let foreignOperatorId: string;
let workspaceA: { id: string; slug: string };
let workspaceB: { id: string; slug: string };
let foreignWorkspace: { id: string; slug: string };

function setRequest(init: { referer?: string; host?: string } = {}) {
  requestHeaders = new Headers({ host: init.host ?? HOST });
  if (init.referer) requestHeaders.set("referer", init.referer);
}

async function setLastUsed(workspaceId: string) {
  await db.session.update({
    where: { id: seededSessionId },
    data: {
      activeWorkspaceId: workspaceId,
      activeWorkspaceOperatorId: operatorId,
    },
  });
}

async function sessionActiveWorkspaceId() {
  const session = await db.session.findUniqueOrThrow({
    where: { id: seededSessionId },
  });
  return session.activeWorkspaceId;
}

beforeAll(async () => {
  operatorId = (
    await db.operator.create({
      data: { username: `${PREFIX}-operator`, passwordHash: "unused" },
    })
  ).id;
  foreignOperatorId = (
    await db.operator.create({
      data: { username: `${PREFIX}-foreign`, passwordHash: "unused" },
    })
  ).id;

  workspaceA = await db.workspace.create({
    data: {
      name: `${PREFIX}-a`,
      slug: `${PREFIX}-a`,
      members: { create: { operatorId, role: "OWNER" } },
    },
  });
  workspaceB = await db.workspace.create({
    data: {
      name: `${PREFIX}-b`,
      slug: `${PREFIX}-b`,
      members: { create: { operatorId, role: "OWNER" } },
    },
  });
  foreignWorkspace = await db.workspace.create({
    data: {
      name: `${PREFIX}-foreign`,
      slug: `${PREFIX}-foreign`,
      members: { create: { operatorId: foreignOperatorId, role: "OWNER" } },
    },
  });

  seededSessionId = (
    await db.session.create({
      data: {
        id: randomUUID(),
        operatorId,
        activeWorkspaceId: workspaceA.id,
        activeWorkspaceOperatorId: operatorId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
  ).id;
});

beforeEach(async () => {
  setRequest();
  await setLastUsed(workspaceA.id);
});

afterAll(async () => {
  const operatorIds = [operatorId, foreignOperatorId];
  await db.session.deleteMany({ where: { operatorId: { in: operatorIds } } });
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id, foreignWorkspace.id] } },
  });
  await db.operator.deleteMany({ where: { id: { in: operatorIds } } });
});

describe("pickLegacyWorkspaceSlug", () => {
  it("falls back to the last-used workspace without a Referer", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceA.slug);
  });

  it("prefers the workspace of a same-origin Referer the operator is a member of", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    setRequest({ referer: `http://${HOST}/w/${workspaceB.slug}/management` });

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceB.slug);
    // The Referer is a hint: it must not move last-used.
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("reads the slug from a locale-prefixed Referer path", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    setRequest({ referer: `http://${HOST}/ru/w/${workspaceB.slug}/notes/1` });

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceB.slug);
  });

  it("matches the Referer host against x-forwarded-host when it is present", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    setRequest({
      host: "internal:3800",
      referer: `https://public.example/w/${workspaceB.slug}/management`,
    });
    requestHeaders.set("x-forwarded-host", "public.example");

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceB.slug);
  });

  it("ignores a cross-origin Referer", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    setRequest({
      referer: `http://evil.example/w/${workspaceB.slug}/management`,
    });

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceA.slug);
  });

  it.each([
    ["a slug of a workspace the operator is not a member of", "foreign"],
    ["an unknown slug", "missing"],
  ])("falls back to last-used for %s in the Referer", async (_label, kind) => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    const slug =
      kind === "foreign" ? foreignWorkspace.slug : `missing-${randomUUID()}`;
    setRequest({ referer: `http://${HOST}/w/${slug}/management` });

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceA.slug);
  });

  it.each([
    ["a Referer that is not a workspace path", `http://${HOST}/login`],
    ["an unparseable Referer", "not a url"],
    ["a Referer with a malformed escape", `http://${HOST}/w/%E0%A4%A/x`],
  ])("falls back to last-used for %s", async (_label, referer) => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    setRequest({ referer });

    expect(await pickLegacyWorkspaceSlug()).toBe(workspaceA.slug);
  });

  it("returns null for an operator with no membership", async () => {
    const { pickLegacyWorkspaceSlug } =
      await import("@/lib/auth/legacy-redirect");
    const lonely = await db.operator.create({
      data: { username: `${PREFIX}-lonely`, passwordHash: "unused" },
    });
    const previousSessionId = seededSessionId;
    seededSessionId = (
      await db.session.create({
        data: {
          id: randomUUID(),
          operatorId: lonely.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
      })
    ).id;

    try {
      setRequest({ referer: `http://${HOST}/w/${workspaceB.slug}/management` });
      expect(await pickLegacyWorkspaceSlug()).toBeNull();
    } finally {
      await db.session.delete({ where: { id: seededSessionId } });
      await db.operator.delete({ where: { id: lonely.id } });
      seededSessionId = previousSessionId;
    }
  });
});

describe("legacy section page", () => {
  async function renderPage(
    section: string,
    rest: string[] | undefined,
    searchParams: Record<string, string | string[] | undefined>,
  ) {
    const { legacySectionPage } =
      await import("@/app/[locale]/(legacy)/legacy-section-page");
    return legacySectionPage(section)({
      params: Promise.resolve({ rest }),
      searchParams: Promise.resolve(searchParams),
    });
  }

  it("keeps locale, path and query: /ru/notes/abc?x=1 -> /ru/w/<last-used>/notes/abc?x=1", async () => {
    await expect(renderPage("notes", ["abc"], { x: "1" })).rejects.toThrow(
      `redirect to /w/${workspaceA.slug}/notes/abc?x=1 with locale ru`,
    );
  });

  it("redirects a bare section: /kanban -> /w/<last-used>/kanban", async () => {
    await expect(renderPage("kanban", undefined, {})).rejects.toThrow(
      `redirect to /w/${workspaceA.slug}/kanban with locale ru`,
    );
  });

  it("redirects under the Referer's workspace when the operator is a member", async () => {
    setRequest({ referer: `http://${HOST}/w/${workspaceB.slug}/management` });

    await expect(renderPage("notes", [], {})).rejects.toThrow(
      `redirect to /w/${workspaceB.slug}/notes with locale ru`,
    );
  });

  it("redirects an operator without any workspace to /no-workspace", async () => {
    const lonely = await db.operator.create({
      data: { username: `${PREFIX}-lonely-page`, passwordHash: "unused" },
    });
    const previousSessionId = seededSessionId;
    seededSessionId = (
      await db.session.create({
        data: {
          id: randomUUID(),
          operatorId: lonely.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
      })
    ).id;

    try {
      await expect(renderPage("management", undefined, {})).rejects.toThrow(
        "redirect to /no-workspace with locale ru",
      );
    } finally {
      await db.session.delete({ where: { id: seededSessionId } });
      await db.operator.delete({ where: { id: lonely.id } });
      seededSessionId = previousSessionId;
    }
  });

  it("sends an unauthenticated visitor to /login", async () => {
    const previousSessionId = seededSessionId;
    seededSessionId = "";

    try {
      await expect(renderPage("notes", ["abc"], {})).rejects.toThrow(
        "redirect to /login with locale ru",
      );
    } finally {
      seededSessionId = previousSessionId;
    }
  });
});
