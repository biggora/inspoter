import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as logsService from "@/lib/services/logs";

// Logs service (FR-LOG-001/002, AC-LOG-001..004). Keyset (cursor) pagination
// on (timestamp, id) — see src/lib/services/logs.ts.

const NAME_PREFIX = `log-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const otherWorkspace = await db.workspace.create({
    data: {
      name: "Other Workspace",
      slug: `test-other-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  otherWorkspaceId = otherWorkspace.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (otherWorkspaceId) {
    await db.workspace
      .delete({ where: { id: otherWorkspaceId } })
      .catch(() => {});
  }
});

describe("AC-LOG-005: create()", () => {
  it("persists a log entry with level/source/message and a default timestamp", async () => {
    const before = new Date();
    const result = await logsService.create(workspaceId, {
      level: "info",
      source: `${NAME_PREFIX}-src`,
      message: "hello world",
    });

    expect(result.id).toBeTruthy();
    const stored = await db.logEntry.findUnique({ where: { id: result.id } });
    expect(stored?.level).toBe("info");
    expect(stored?.source).toBe(`${NAME_PREFIX}-src`);
    expect(stored?.message).toBe("hello world");
    expect(stored?.timestamp.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });

  it("persists the given optional timestamp instead of the default", async () => {
    const timestamp = "2024-01-15T10:00:00.000Z";
    const result = await logsService.create(workspaceId, {
      level: "warn",
      source: `${NAME_PREFIX}-src-ts`,
      message: "with explicit timestamp",
      timestamp,
    });

    const stored = await db.logEntry.findUnique({ where: { id: result.id } });
    expect(stored?.timestamp.toISOString()).toBe(timestamp);
  });
});

describe("AC-LOG-002: filters", () => {
  const level = `${NAME_PREFIX}-level`;
  const source = `${NAME_PREFIX}-filter-src`;

  beforeAll(async () => {
    await logsService.create(workspaceId, {
      level,
      source,
      message: "database connection refused",
    });
    await logsService.create(workspaceId, {
      level: "other-level",
      source,
      message: "unrelated entry",
    });
  });

  it("filters by level", async () => {
    const result = await logsService.list(workspaceId, { level });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.level === level)).toBe(true);
  });

  it("filters by source", async () => {
    const result = await logsService.list(workspaceId, { source });
    expect(result.items.length).toBe(2);
    expect(result.items.every((i) => i.source === source)).toBe(true);
  });

  it("filters by a case-insensitive text query on message", async () => {
    const result = await logsService.list(workspaceId, {
      source,
      query: "CONNECTION REFUSED",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].message).toBe("database connection refused");
  });
});

describe("AC-LOG-003/004: sort and keyset pagination", () => {
  const source = `${NAME_PREFIX}-page-src`;
  const total = 5;

  beforeAll(async () => {
    const base = Date.now();
    for (let i = 0; i < total; i++) {
      await logsService.create(workspaceId, {
        level: "info",
        source,
        message: `entry-${i}`,
        timestamp: new Date(base + i * 1000).toISOString(),
      });
    }
  });

  it("descending sort returns the most recent entry first", async () => {
    const result = await logsService.list(workspaceId, {
      source,
      sort: "desc",
      pageSize: total,
    });
    expect(result.items).toHaveLength(total);
    expect(result.items[0].message).toBe(`entry-${total - 1}`);
    expect(result.items[total - 1].message).toBe("entry-0");
  });

  it("ascending sort returns the oldest entry first", async () => {
    const result = await logsService.list(workspaceId, {
      source,
      sort: "asc",
      pageSize: total,
    });
    expect(result.items[0].message).toBe("entry-0");
    expect(result.items[total - 1].message).toBe(`entry-${total - 1}`);
  });

  it("paginates with a bounded page size and a cursor that fetches the remainder", async () => {
    const pageSize = 2;
    const firstPage = await logsService.list(workspaceId, {
      source,
      sort: "asc",
      pageSize,
    });
    expect(firstPage.items).toHaveLength(pageSize);
    expect(firstPage.nextCursor).toBeTruthy();

    const collected = [...firstPage.items];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await logsService.list(workspaceId, {
        source,
        sort: "asc",
        pageSize,
        cursor,
      });
      collected.push(...page.items);
      cursor = page.nextCursor;
    }

    expect(collected).toHaveLength(total);
    expect(collected.map((i) => i.message)).toEqual(
      Array.from({ length: total }, (_, i) => `entry-${i}`),
    );
  });
});

describe("Workspace isolation", () => {
  it("does not return another workspace's log entries", async () => {
    const source = `${NAME_PREFIX}-isolation-src`;
    await logsService.create(workspaceId, {
      level: "info",
      source,
      message: "belongs to workspace A",
    });

    const resultForOther = await logsService.list(otherWorkspaceId, {
      source,
    });
    expect(resultForOther.items).toHaveLength(0);

    const resultForOwner = await logsService.list(workspaceId, { source });
    expect(resultForOwner.items).toHaveLength(1);
  });

  it("ignores a cursor issued for a different workspace instead of throwing", async () => {
    const source = `${NAME_PREFIX}-cursor-binding-src`;
    await logsService.create(workspaceId, {
      level: "info",
      source,
      message: "workspace A entry",
    });
    await logsService.create(otherWorkspaceId, {
      level: "info",
      source,
      message: "workspace B entry",
    });

    const pageFromA = await logsService.list(workspaceId, {
      source,
      pageSize: 1,
    });
    expect(pageFromA.nextCursor).toBeNull();

    const foreignCursor = Buffer.from(
      JSON.stringify({
        w: workspaceId,
        t: new Date().toISOString(),
        id: "does-not-matter",
      }),
    ).toString("base64url");

    const resultForOther = await logsService.list(otherWorkspaceId, {
      source,
      cursor: foreignCursor,
    });

    expect(resultForOther.items).toHaveLength(1);
    expect(resultForOther.items[0].message).toBe("workspace B entry");
  });
});
