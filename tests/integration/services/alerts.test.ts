import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as alertsService from "@/lib/services/alerts";
import { Prisma } from "@/generated/prisma/client";

const NAME_PREFIX = `alr-${randomUUID()}`;
let workspaceId: string;
let workspaceBId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const workspaceB = await db.workspace.create({
    data: {
      name: "Test Workspace B",
      slug: `test-b-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceBId = workspaceB.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (workspaceBId) {
    await db.workspace.delete({ where: { id: workspaceBId } }).catch(() => {});
  }
});

describe("AC-ALR-007: create() with category auto-upsert", () => {
  it("creates a new category when the named category does not exist yet", async () => {
    const categoryName = `${NAME_PREFIX}-auto-upsert`;
    const alert = await alertsService.create(workspaceId, {
      category: categoryName,
      severity: "critical",
      source: "router1",
      message: "Link down",
    });

    const categories = await alertsService.listCategories(workspaceId);
    const category = categories.find((c) => c.name === categoryName);
    expect(category).toBeDefined();

    const { items } = await alertsService.list(workspaceId, {
      categoryId: category!.id,
    });
    expect(items.some((a) => a.id === alert.id)).toBe(true);
    expect(items.find((a) => a.id === alert.id)?.alertCategory?.name).toBe(
      categoryName,
    );
  });

  it("reuses an existing category instead of creating a duplicate", async () => {
    const categoryName = `${NAME_PREFIX}-reused`;
    await alertsService.create(workspaceId, {
      category: categoryName,
      severity: "warning",
      source: "router2",
      message: "High latency",
    });
    await alertsService.create(workspaceId, {
      category: categoryName,
      severity: "warning",
      source: "router3",
      message: "Packet loss",
    });

    const categories = await alertsService.listCategories(workspaceId);
    const matching = categories.filter((c) => c.name === categoryName);
    expect(matching).toHaveLength(1);
  });

  // The Services scheduler checks up to CHUNK_SIZE services per tick inside a
  // single Promise.all, so several services flipping at once race on the very
  // first "Сервисы" category of a workspace. A non-atomic find-then-create
  // loses every loser of that race to a unique-constraint violation.
  it("does not lose alerts when concurrent creates race on the same new category", async () => {
    const categoryName = `${NAME_PREFIX}-concurrent`;
    // The pg pool opens connections lazily, so without a warm-up the first
    // create would finish before the rest even have a socket — and the race
    // this test exists for would never happen.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.alertCategory.findFirst({ where: { workspaceId, name: "warmup" } }),
      ),
    );

    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        alertsService.create(workspaceId, {
          category: categoryName,
          severity: "critical",
          source: `racer-${i}`,
          message: `Concurrent alert ${i}`,
        }),
      ),
    );

    const categories = await alertsService.listCategories(workspaceId);
    expect(categories.filter((c) => c.name === categoryName)).toHaveLength(1);

    const stored = await db.alert.findMany({
      where: { id: { in: created.map((a) => a.id) } },
    });
    expect(stored).toHaveLength(10);
  });
});

describe("AC-ALR-007: create() with explicit timestamp", () => {
  it("stores the provided timestamp instead of defaulting to now", async () => {
    const explicitDate = new Date("2020-01-15T08:30:00.000Z");
    const alert = await alertsService.create(workspaceId, {
      category: `${NAME_PREFIX}-explicit-ts`,
      severity: "info",
      source: "sensor1",
      message: "Explicit timestamp",
      timestamp: explicitDate.toISOString(),
    });

    const stored = await db.alert.findUnique({ where: { id: alert.id } });
    expect(stored?.timestamp.toISOString()).toBe(explicitDate.toISOString());
  });
});

describe("AC-ALR-003/006: list() keyset cursor pagination", () => {
  it("paginates ascending and descending with stable ordering and no duplicates/omissions", async () => {
    const categoryName = `${NAME_PREFIX}-pagination`;
    const category = await alertsService.createCategory(
      workspaceId,
      categoryName,
    );

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const alert = await alertsService.create(workspaceId, {
        category: categoryName,
        severity: "info",
        source: "pagination-source",
        message: `alert-${i}`,
      });
      created.push(alert.id);
    }

    const page1 = await alertsService.list(workspaceId, {
      categoryId: category.id,
      pageSize: 2,
      sort: "desc",
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await alertsService.list(workspaceId, {
      categoryId: category.id,
      pageSize: 2,
      sort: "desc",
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await alertsService.list(workspaceId, {
      categoryId: category.id,
      pageSize: 2,
      sort: "desc",
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allDescIds = [...page1.items, ...page2.items, ...page3.items].map(
      (a) => a.id,
    );
    expect(new Set(allDescIds).size).toBe(5);
    expect(allDescIds.sort()).toEqual([...created].sort());

    const ascPage1 = await alertsService.list(workspaceId, {
      categoryId: category.id,
      pageSize: 2,
      sort: "asc",
    });
    expect(ascPage1.items.map((a) => a.message)).toEqual([
      "alert-0",
      "alert-1",
    ]);

    const ascPage2 = await alertsService.list(workspaceId, {
      categoryId: category.id,
      pageSize: 2,
      sort: "asc",
      cursor: ascPage1.nextCursor!,
    });
    expect(ascPage2.items.map((a) => a.message)).toEqual([
      "alert-2",
      "alert-3",
    ]);
  });
});

describe("AC-ALR-004: filter by categoryId, severity, query", () => {
  it("filters by categoryId to only the alerts under that category", async () => {
    const categoryA = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-filter-cat-a`,
    );
    const categoryB = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-filter-cat-b`,
    );
    const alertA = await alertsService.create(workspaceId, {
      category: categoryA.name,
      severity: "critical",
      source: "src-a",
      message: "in category A",
    });
    const alertB = await alertsService.create(workspaceId, {
      category: categoryB.name,
      severity: "critical",
      source: "src-b",
      message: "in category B",
    });

    const { items } = await alertsService.list(workspaceId, {
      categoryId: categoryA.id,
    });
    expect(items.some((a) => a.id === alertA.id)).toBe(true);
    expect(items.some((a) => a.id === alertB.id)).toBe(false);
  });

  it("filters by severity within a category", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-filter-severity`,
    );
    const critical = await alertsService.create(workspaceId, {
      category: category.name,
      severity: "critical",
      source: "src-sev",
      message: "critical one",
    });
    const info = await alertsService.create(workspaceId, {
      category: category.name,
      severity: "info",
      source: "src-sev",
      message: "info one",
    });

    const { items } = await alertsService.list(workspaceId, {
      categoryId: category.id,
      severity: "critical",
    });
    expect(items.some((a) => a.id === critical.id)).toBe(true);
    expect(items.some((a) => a.id === info.id)).toBe(false);
  });

  it("filters by text query against the message", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-filter-query`,
    );
    const matching = await alertsService.create(workspaceId, {
      category: category.name,
      severity: "warning",
      source: "src-query",
      message: `${NAME_PREFIX}-needle-value`,
    });
    const nonMatching = await alertsService.create(workspaceId, {
      category: category.name,
      severity: "warning",
      source: "src-query",
      message: "unrelated haystack",
    });

    const { items } = await alertsService.list(workspaceId, {
      categoryId: category.id,
      query: "needle",
    });
    expect(items.some((a) => a.id === matching.id)).toBe(true);
    expect(items.some((a) => a.id === nonMatching.id)).toBe(false);
  });
});

describe("AC-ALR-001: listCategories()", () => {
  it("returns categories sorted by name ascending", async () => {
    await alertsService.createCategory(workspaceId, `${NAME_PREFIX}-sort-b`);
    await alertsService.createCategory(workspaceId, `${NAME_PREFIX}-sort-a`);

    const categories = await alertsService.listCategories(workspaceId);
    const names = categories
      .map((c) => c.name)
      .filter((n) => n.startsWith(`${NAME_PREFIX}-sort-`));
    expect(names).toEqual([...names].sort());
  });
});

describe("AC-ALR-001/002: createCategory / renameCategory / deleteCategory", () => {
  it("rejects creating a category with a duplicate name in the same workspace", async () => {
    const name = `${NAME_PREFIX}-duplicate`;
    await alertsService.createCategory(workspaceId, name);

    await expect(
      alertsService.createCategory(workspaceId, name),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("renameCategory persists the new name", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-old-name`,
    );
    const renamed = await alertsService.renameCategory(
      category.id,
      workspaceId,
      `${NAME_PREFIX}-new-name`,
    );
    expect(renamed.name).toBe(`${NAME_PREFIX}-new-name`);
  });

  it("renameCategory throws when the category belongs to a different workspace", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-wrong-ws-rename`,
    );

    await expect(
      alertsService.renameCategory(
        category.id,
        workspaceBId,
        `${NAME_PREFIX}-should-not-apply`,
      ),
    ).rejects.toThrow("Category not found");
  });

  it("deleteCategory throws when the category belongs to a different workspace", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-wrong-ws-delete`,
    );

    await expect(
      alertsService.deleteCategory(category.id, workspaceBId),
    ).rejects.toThrow("Category not found");
  });

  it("AC-ALR-002: deleteCategory removes the category and leaves its alerts uncategorized (no orphans)", async () => {
    const categoryName = `${NAME_PREFIX}-cascade-delete`;
    const alert = await alertsService.create(workspaceId, {
      category: categoryName,
      severity: "info",
      source: "src-cascade",
      message: "will be uncategorized",
    });
    const category = await db.alertCategory.findFirstOrThrow({
      where: { workspaceId, name: categoryName },
    });

    await alertsService.deleteCategory(category.id, workspaceId);

    const remainingCategories = await db.alertCategory.findMany({
      where: { id: category.id },
    });
    expect(remainingCategories).toHaveLength(0);

    const remainingAlert = await db.alert.findUnique({
      where: { id: alert.id },
    });
    expect(remainingAlert).not.toBeNull();
    expect(remainingAlert?.alertCategoryId).toBeNull();

    // "No orphan" has to hold for the list the UI actually renders, not just
    // for the row in the table — otherwise deleting a category silently hides
    // its alerts forever.
    const { items } = await alertsService.list(workspaceId, {});
    const listed = items.find((a) => a.id === alert.id);
    expect(listed).toBeDefined();
    expect(listed?.alertCategory).toBeNull();
  });
});

describe("UTC day filtering", () => {
  it("returns only alerts inside the linked calendar day", async () => {
    const category = `${NAME_PREFIX}-calendar-day`;
    const inside = await alertsService.create(workspaceId, {
      category,
      severity: "warning",
      source: "calendar-test",
      message: "inside linked day",
      timestamp: "2026-07-31T23:59:59.000Z",
    });
    await alertsService.create(workspaceId, {
      category,
      severity: "warning",
      source: "calendar-test",
      message: "outside linked day",
      timestamp: "2026-08-01T00:00:00.000Z",
    });

    const result = await alertsService.list(workspaceId, {
      date: "2026-07-31",
    });

    expect(result.items.map((alert) => alert.id)).toContain(inside.id);
    expect(result.items.map((alert) => alert.message)).not.toContain(
      "outside linked day",
    );
  });
});

describe("Workspace isolation", () => {
  it("alerts and categories from workspace A are not visible in workspace B", async () => {
    const category = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-isolation-cat`,
    );
    await alertsService.create(workspaceId, {
      category: category.name,
      severity: "info",
      source: "src-isolation",
      message: "isolated alert",
    });

    const categoriesInB = await alertsService.listCategories(workspaceBId);
    expect(categoriesInB.some((c) => c.id === category.id)).toBe(false);

    const { items } = await alertsService.list(workspaceBId, {
      categoryId: category.id,
    });
    expect(items).toHaveLength(0);
  });
});

describe("Cursor workspace-binding", () => {
  it("silently resets a cursor minted for workspace A when queried against workspace B", async () => {
    const categoryA = await alertsService.createCategory(
      workspaceId,
      `${NAME_PREFIX}-cursor-binding-a`,
    );
    for (let i = 0; i < 3; i++) {
      await alertsService.create(workspaceId, {
        category: categoryA.name,
        severity: "info",
        source: "src-cursor-a",
        message: `bound-a-${i}`,
      });
    }

    const categoryB = await alertsService.createCategory(
      workspaceBId,
      `${NAME_PREFIX}-cursor-binding-b`,
    );
    for (let i = 0; i < 3; i++) {
      await alertsService.create(workspaceBId, {
        category: categoryB.name,
        severity: "info",
        source: "src-cursor-b",
        message: `bound-b-${i}`,
      });
    }

    const page1A = await alertsService.list(workspaceId, {
      categoryId: categoryA.id,
      pageSize: 1,
      sort: "desc",
    });
    expect(page1A.nextCursor).not.toBeNull();

    const withForeignCursor = await alertsService.list(workspaceBId, {
      categoryId: categoryB.id,
      pageSize: 1,
      sort: "desc",
      cursor: page1A.nextCursor!,
    });
    const withoutCursor = await alertsService.list(workspaceBId, {
      categoryId: categoryB.id,
      pageSize: 1,
      sort: "desc",
    });

    expect(withForeignCursor.items.map((a) => a.id)).toEqual(
      withoutCursor.items.map((a) => a.id),
    );
  });
});
