import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";

// Slice 5 of docs/plans/workspace-in-url.md (AC-WS-014 step 1): a legacy
// single-entity deep link is redirected into the workspace that owns the
// entity, when the operator is a member of it. Otherwise the slug is chosen as
// if the link carried no id (Referer, then last-used) and nothing reveals
// whether the entity exists. The project-wide mocks (tests/setup.integration.ts)
// make the locale-aware `redirect` throw `redirect to <href> with locale <l>`.

let seededSessionId = "";
let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
  headers: async () => requestHeaders,
}));

const PREFIX = `deeplink-${randomUUID()}`;
const HOST = "inspoter.test";
let operatorId: string;
let foreignOperatorId: string;
let workspaceA: { id: string; slug: string };
let workspaceB: { id: string; slug: string };
let foreignWorkspace: { id: string; slug: string };

// One entity per deep-link form: the legacy path segments and how to create a
// row of the model that form addresses.
interface Kind {
  name: string;
  section: string;
  prefix: string[];
  create: (workspaceId: string) => Promise<string>;
}

const KINDS: Kind[] = [
  {
    name: "notes",
    section: "notes",
    prefix: [],
    create: async (workspaceId) =>
      (
        await db.note.create({
          data: { workspaceId, title: "n", normalizedTitle: "n" },
        })
      ).id,
  },
  {
    name: "kanban",
    section: "kanban",
    prefix: [],
    create: async (workspaceId) =>
      (await db.kanbanBoard.create({ data: { workspaceId, name: "board" } }))
        .id,
  },
  {
    name: "contacts",
    section: "contacts",
    prefix: [],
    create: async (workspaceId) =>
      (
        await db.contact.create({
          data: {
            workspaceId,
            displayName: "c",
            sortKey: "c",
            searchText: "c",
          },
        })
      ).id,
  },
  {
    name: "services",
    section: "services",
    prefix: [],
    create: async (workspaceId) =>
      (
        await db.service.create({
          data: {
            workspaceId,
            name: "svc",
            monitorType: "TCP",
            host: "127.0.0.1",
            port: 80,
          },
        })
      ).id,
  },
  {
    name: "servers",
    section: "servers",
    prefix: [],
    create: async (workspaceId) =>
      (
        await db.localServer.create({
          data: { workspaceId, origin: "AGENT", displayName: "srv" },
        })
      ).id,
  },
  {
    name: "agents",
    section: "agents",
    prefix: [],
    create: async (workspaceId) => createAgent(workspaceId),
  },
  {
    name: "agents/runs",
    section: "agents",
    prefix: ["runs"],
    create: async (workspaceId) =>
      (
        await db.agentRun.create({
          data: {
            workspaceId,
            sourceAgentId: randomUUID(),
            snapshotAgentName: "a",
            snapshotInstructions: "i",
            snapshotMaxSteps: 1,
            snapshotMaxTokens: 1,
            snapshotTimeoutSeconds: 1,
            trigger: "MANUAL",
            idempotencyKey: `${PREFIX}:${randomUUID()}`,
          },
        })
      ).id,
  },
  {
    name: "agents/chats",
    section: "agents",
    prefix: ["chats"],
    create: async (workspaceId) =>
      (
        await db.agentConversation.create({
          data: {
            workspaceId,
            title: "chat",
            createdByOperatorId: operatorId,
            createdByOperatorName: "op",
          },
        })
      ).id,
  },
  {
    name: "dashboards",
    section: "dashboards",
    prefix: [],
    create: async (workspaceId) =>
      (await db.dashboard.create({ data: { workspaceId, name: "dash" } })).id,
  },
];

async function createAgent(workspaceId: string) {
  const name = `agent-${randomUUID()}`;
  return (
    await db.agent.create({
      data: {
        workspaceId,
        name,
        normalizedName: name,
        instructions: "i",
      },
    })
  ).id;
}

const idInB = new Map<string, string>();
const idInForeign = new Map<string, string>();

function setRequest(init: { referer?: string } = {}) {
  requestHeaders = new Headers({ host: HOST });
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

async function renderPage(section: string, rest: string[]) {
  const { legacySectionPage } =
    await import("@/app/[locale]/(legacy)/legacy-section-page");
  return legacySectionPage(section)({
    params: Promise.resolve({ rest }),
    searchParams: Promise.resolve({}),
  });
}

// What the page answers for a legacy path: the redirect target and nothing else.
async function redirectOf(section: string, rest: string[]): Promise<string> {
  try {
    await renderPage(section, rest);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("The legacy page did not redirect.");
}

function expectedRedirect(slug: string, segments: string[]): string {
  return `redirect to /w/${slug}/${segments.join("/")} with locale ru`;
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

  for (const kind of KINDS) {
    idInB.set(kind.name, await kind.create(workspaceB.id));
    idInForeign.set(kind.name, await kind.create(foreignWorkspace.id));
  }

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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const operatorIds = [operatorId, foreignOperatorId];
  await db.session.deleteMany({ where: { operatorId: { in: operatorIds } } });
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id, foreignWorkspace.id] } },
  });
  await db.operator.deleteMany({ where: { id: { in: operatorIds } } });
});

describe("legacy deep link: the owning workspace", () => {
  it.each(KINDS)(
    "/$name/<id> of a workspace the operator is a member of goes there, not to last-used",
    async (kind) => {
      const segments = [kind.section, ...kind.prefix, idInB.get(kind.name)!];

      expect(await redirectOf(segments[0]!, segments.slice(1))).toBe(
        expectedRedirect(workspaceB.slug, segments),
      );
    },
  );

  it("beats a same-origin Referer of another member workspace", async () => {
    // The note lives in B, the Referer points into A (also last-used).
    setRequest({ referer: `http://${HOST}/w/${workspaceA.slug}/management` });
    const id = idInB.get("notes")!;

    expect(await redirectOf("notes", [id])).toBe(
      expectedRedirect(workspaceB.slug, ["notes", id]),
    );
  });

  it("does not move last-used", async () => {
    await redirectOf("notes", [idInB.get("notes")!]);

    const session = await db.session.findUniqueOrThrow({
      where: { id: seededSessionId },
    });
    expect(session.activeWorkspaceId).toBe(workspaceA.id);
  });

  it("resolves /agents/runs/<id> and /agents/chats/<id> against their own models", async () => {
    const agentId = idInB.get("agents")!;
    const runId = idInB.get("agents/runs")!;
    const chatId = idInB.get("agents/chats")!;

    // An agent id is not a run: /agents/runs/<agentId> finds nothing and falls
    // back to last-used, while the same id as /agents/<id> resolves.
    expect(await redirectOf("agents", ["runs", agentId])).toBe(
      expectedRedirect(workspaceA.slug, ["agents", "runs", agentId]),
    );
    expect(await redirectOf("agents", ["chats", runId])).toBe(
      expectedRedirect(workspaceA.slug, ["agents", "chats", runId]),
    );
    expect(await redirectOf("agents", [chatId])).toBe(
      expectedRedirect(workspaceA.slug, ["agents", chatId]),
    );
    expect(await redirectOf("agents", [agentId])).toBe(
      expectedRedirect(workspaceB.slug, ["agents", agentId]),
    );
  });
});

// A backup import re-creates contacts, dashboards, kanban boards and services
// with crypto.randomUUID() ids (backup.ts), so their deep links carry a UUID,
// not a cuid.
describe("legacy deep link: UUID ids from a backup import", () => {
  const UUID_KINDS = [
    {
      section: "contacts",
      create: (id: string, workspaceId: string) =>
        db.contact.create({
          data: {
            id,
            workspaceId,
            displayName: "c",
            sortKey: "c",
            searchText: "c",
          },
        }),
    },
    {
      section: "kanban",
      create: (id: string, workspaceId: string) =>
        db.kanbanBoard.create({ data: { id, workspaceId, name: "board" } }),
    },
    {
      section: "dashboards",
      create: (id: string, workspaceId: string) =>
        db.dashboard.create({ data: { id, workspaceId, name: "dash" } }),
    },
    {
      section: "services",
      create: (id: string, workspaceId: string) =>
        db.service.create({
          data: {
            id,
            workspaceId,
            name: "svc",
            monitorType: "TCP",
            host: "127.0.0.1",
            port: 80,
          },
        }),
    },
  ];

  it.each(UUID_KINDS)(
    "/$section/<uuid> of a workspace the operator is a member of goes there",
    async ({ section, create }) => {
      const id = randomUUID();
      await create(id, workspaceB.id);

      expect(await redirectOf(section, [id])).toBe(
        expectedRedirect(workspaceB.slug, [section, id]),
      );
    },
  );

  it("treats a UUID owned by a foreign workspace like an unknown one", async () => {
    const id = randomUUID();
    await UUID_KINDS[0]!.create(id, foreignWorkspace.id);

    expect(await redirectOf("contacts", [id])).toBe(
      expectedRedirect(workspaceA.slug, ["contacts", id]),
    );
  });

  it.each([
    ["an uppercase UUID", randomUUID().toUpperCase()],
    ["a UUID without dashes", randomUUID().replaceAll("-", "")],
    ["a UUID with a trailing character", `${randomUUID()}0`],
    ["a UUID with a non-hex digit", `${randomUUID().slice(0, 35)}g`],
  ])("%s runs no query and falls back to last-used", async (_label, id) => {
    const findFirst = vi.spyOn(db.contact, "findFirst");

    expect(await redirectOf("contacts", [id])).toBe(
      expectedRedirect(workspaceA.slug, ["contacts", id]),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("legacy deep link: no disclosure", () => {
  it.each(KINDS)(
    "/$name/<id> owned by a workspace the operator is not in falls back to last-used and keeps the id",
    async (kind) => {
      const segments = [
        kind.section,
        ...kind.prefix,
        idInForeign.get(kind.name)!,
      ];

      expect(await redirectOf(segments[0]!, segments.slice(1))).toBe(
        expectedRedirect(workspaceA.slug, segments),
      );
    },
  );

  it("falls back to the member Referer, as a link without an id does", async () => {
    setRequest({ referer: `http://${HOST}/w/${workspaceB.slug}/management` });
    const id = idInForeign.get("notes")!;

    expect(await redirectOf("notes", [id])).toBe(
      expectedRedirect(workspaceB.slug, ["notes", id]),
    );
  });

  it.each([
    ["without a Referer", undefined],
    ["with a member Referer", "member"],
    ["with a Referer into the foreign workspace", "foreign"],
  ])(
    "answers an unknown id exactly like a foreign one %s",
    async (_label, referer) => {
      const unknownId = `c${"0".repeat(24)}`;
      const foreignId = idInForeign.get("notes")!;
      const slugOfReferer =
        referer === "member"
          ? workspaceB.slug
          : referer === "foreign"
            ? foreignWorkspace.slug
            : null;
      const refererUrl = slugOfReferer
        ? `http://${HOST}/w/${slugOfReferer}/management`
        : undefined;

      setRequest({ referer: refererUrl });
      const unknown = await redirectOf("notes", [unknownId]);
      setRequest({ referer: refererUrl });
      const foreign = await redirectOf("notes", [foreignId]);

      expect(unknown.replace(unknownId, "<id>")).toBe(
        foreign.replace(foreignId, "<id>"),
      );
    },
  );

  it("runs one query for a foreign id and one for an unknown id", async () => {
    const findFirst = vi.spyOn(db.note, "findFirst");

    await redirectOf("notes", [idInForeign.get("notes")!]);
    expect(findFirst).toHaveBeenCalledTimes(1);
    await redirectOf("notes", [`c${"0".repeat(24)}`]);
    expect(findFirst).toHaveBeenCalledTimes(2);
    // The membership is part of that query, not a second lookup.
    expect(findFirst.mock.calls[0]![0]).toMatchObject({
      where: { workspace: { members: { some: { operatorId } } } },
    });
  });
});

describe("legacy deep link: paths that are not deep links", () => {
  it.each([
    ["a non-cuid id", ["not-a-cuid"]],
    ["an uppercase id", [`C${"0".repeat(24)}`]],
    ["a percent-encoded id", [`c${"0".repeat(21)}%30%30%30`]],
    ["a too long id", [`c${"0".repeat(25)}`]],
    ["a section word where an id would be", ["runs"]],
  ])("%s runs no query and falls back to last-used", async (_label, rest) => {
    const findFirst = vi.spyOn(db.note, "findFirst");

    expect(await redirectOf("notes", rest)).toBe(
      expectedRedirect(workspaceA.slug, ["notes", ...rest]),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["agents", ["runs"]],
    ["agents", ["chats"]],
    ["agents", ["runs", "nope"]],
  ])("/%s/%j runs no query on any model", async (section, rest) => {
    const spies = [
      vi.spyOn(db.agent, "findFirst"),
      vi.spyOn(db.agentRun, "findFirst"),
      vi.spyOn(db.agentConversation, "findFirst"),
    ];

    expect(await redirectOf(section, rest)).toBe(
      expectedRedirect(workspaceA.slug, [section, ...rest]),
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("does not treat a longer path as a deep link", async () => {
    const id = idInB.get("notes")!;
    const findFirst = vi.spyOn(db.note, "findFirst");

    expect(await redirectOf("notes", [id, "extra"])).toBe(
      expectedRedirect(workspaceA.slug, ["notes", id, "extra"]),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not treat a section without an id as a deep link", async () => {
    const findFirst = vi.spyOn(db.note, "findFirst");

    expect(await redirectOf("notes", [])).toBe(
      expectedRedirect(workspaceA.slug, ["notes"]),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not resolve an id under a section that has no detail page", async () => {
    // A note id under /mail is not one of the nine forms.
    const findFirst = vi.spyOn(db.note, "findFirst");
    const id = idInB.get("notes")!;

    expect(await redirectOf("mail", [id])).toBe(
      expectedRedirect(workspaceA.slug, ["mail", id]),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});
