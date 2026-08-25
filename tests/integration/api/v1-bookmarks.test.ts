import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  GET as listBookmarks,
  POST as createBookmark,
} from "@/app/api/v1/bookmarks/route";
import {
  DELETE as deleteBookmark,
  GET as getBookmark,
  PATCH as updateBookmark,
} from "@/app/api/v1/bookmarks/[bookmarkId]/route";
import { PATCH as reorderBookmarks } from "@/app/api/v1/bookmarks/reorder/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "@/app/api/v1/bookmarks/categories/route";
import { PATCH as updateCategory } from "@/app/api/v1/bookmarks/categories/[categoryId]/route";
import { PATCH as reorderCategories } from "@/app/api/v1/bookmarks/categories/reorder/route";

// /api/v1/bookmarks/** end-to-end: the bearer token is the only authority, it
// carries the workspace, and the scope decides read from write. No session
// cookie and no X-Inspoter-Workspace header are involved anywhere here.
//
// favicon-suggest is covered by tests/unit/api/bookmarks-favicon-suggest.test.ts
// against the shared probe; exercising it here would make an outbound request.

const PREFIX = `v1-bookmarks-${randomUUID()}`;

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let scopelessToken: string;
let otherWorkspaceToken: string;
let categoryId: string;
let bookmarkId: string;

function request(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;

  writeToken = (
    await webhookTokensService.create(workspaceId, "agent", [
      "bookmarks:read",
      "bookmarks:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", [
      "bookmarks:read",
    ])
  ).token;
  scopelessToken = (await webhookTokensService.create(workspaceId, "ingest"))
    .token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "bookmarks:read",
      "bookmarks:write",
    ])
  ).token;

  const category = await bookmarksService.createCategory(workspaceId, {
    name: `${PREFIX}-runbooks`,
  });
  categoryId = category.id;
  const bookmark = await bookmarksService.createBookmark(workspaceId, {
    name: `${PREFIX}-incident-runbook`,
    url: "https://runbook.example.invalid/incidents",
    categoryId,
  });
  bookmarkId = bookmark.id;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication and scopes", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await listBookmarks(request("/api/v1/bookmarks"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an unknown or scopeless token", async () => {
    for (const token of ["not-a-real-token", scopelessToken]) {
      const response = await listBookmarks(
        request("/api/v1/bookmarks", { token }),
      );
      expect(response.status).toBe(401);
    }
  });

  it("rejects a read-only token on a write operation", async () => {
    const response = await createBookmark(
      request("/api/v1/bookmarks", {
        method: "POST",
        token: readToken,
        body: {
          name: "Should not exist",
          url: "https://nope.example.invalid",
          categoryId,
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(
      await db.bookmark.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});

describe("bookmarks", () => {
  it("answers a flat, searchable list carrying the category names", async () => {
    const response = await listBookmarks(
      request(`/api/v1/bookmarks?query=${PREFIX}-incident`, {
        token: readToken,
      }),
    );

    expect(response.status).toBe(200);
    const page = await body<{
      items: Array<{ id: string; categoryName: string }>;
      total: number;
    }>(response);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: bookmarkId,
      categoryName: `${PREFIX}-runbooks`,
      parentCategoryName: null,
    });
  });

  it("rejects an unknown query parameter", async () => {
    const response = await listBookmarks(
      request("/api/v1/bookmarks?unexpected=1", { token: readToken }),
    );

    expect(response.status).toBe(400);
  });

  it("creates, reads, updates and deletes a bookmark and journals each write", async () => {
    const created = await createBookmark(
      request("/api/v1/bookmarks", {
        method: "POST",
        token: writeToken,
        body: {
          name: `${PREFIX}-grafana`,
          url: "https://grafana.example.invalid",
          categoryId,
          color: "accent",
        },
      }),
    );
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);

    const read = await getBookmark(
      request(`/api/v1/bookmarks/${id}`, { token: readToken }),
      params({ bookmarkId: id }),
    );
    expect(await body<{ color: string }>(read)).toMatchObject({
      color: "accent",
    });

    const updated = await updateBookmark(
      request(`/api/v1/bookmarks/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-grafana-prod` },
      }),
      params({ bookmarkId: id }),
    );
    expect(await body<{ name: string }>(updated)).toMatchObject({
      name: `${PREFIX}-grafana-prod`,
    });

    const removed = await deleteBookmark(
      request(`/api/v1/bookmarks/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ bookmarkId: id }),
    );
    expect(await body(removed)).toEqual({ deleted: id });
    expect(await db.bookmark.findUnique({ where: { id } })).toBeNull();

    await expect
      .poll(async () => {
        const entries = await db.activity.findMany({
          where: { workspaceId, entityType: "bookmark", entityId: id },
          select: { action: true },
        });
        return entries.map((entry) => entry.action).sort();
      })
      .toEqual(["create", "delete", "update"]);
    const activity = await db.activity.findMany({
      where: { workspaceId, entityType: "bookmark", entityId: id },
      select: { operatorName: true },
    });
    expect(new Set(activity.map((entry) => entry.operatorName))).toEqual(
      new Set(["agent"]),
    );
  });

  it("rejects a non-http url", async () => {
    const response = await createBookmark(
      request("/api/v1/bookmarks", {
        method: "POST",
        token: writeToken,
        body: {
          name: `${PREFIX}-bad-url`,
          url: "ftp://files.example.invalid",
          categoryId,
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("answers 400 for a category belonging to another workspace", async () => {
    const foreign = await bookmarksService.createCategory(otherWorkspaceId, {
      name: `${PREFIX}-foreign`,
    });

    const response = await createBookmark(
      request("/api/v1/bookmarks", {
        method: "POST",
        token: writeToken,
        body: {
          name: `${PREFIX}-cross-tenant`,
          url: "https://cross.example.invalid",
          categoryId: foreign.id,
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(
      await db.bookmark.count({ where: { name: `${PREFIX}-cross-tenant` } }),
    ).toBe(0);
  });

  it("answers 404 for a bookmark of another workspace", async () => {
    for (const call of [
      () =>
        getBookmark(
          request(`/api/v1/bookmarks/${bookmarkId}`, {
            token: otherWorkspaceToken,
          }),
          params({ bookmarkId }),
        ),
      () =>
        deleteBookmark(
          request(`/api/v1/bookmarks/${bookmarkId}`, {
            method: "DELETE",
            token: otherWorkspaceToken,
          }),
          params({ bookmarkId }),
        ),
    ]) {
      expect((await call()).status).toBe(404);
    }
    expect(
      await db.bookmark.findUnique({ where: { id: bookmarkId } }),
    ).not.toBe(null);
  });

  it("reorders the bookmarks of a category", async () => {
    const names = [`${PREFIX}-a`, `${PREFIX}-b`];
    for (const name of names) {
      await createBookmark(
        request("/api/v1/bookmarks", {
          method: "POST",
          token: writeToken,
          body: { name, url: "https://a.example.invalid", categoryId },
        }),
      );
    }
    const before = await db.bookmark.findMany({
      where: { categoryId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const reversed = before.map((row) => row.id).reverse();

    const response = await reorderBookmarks(
      request("/api/v1/bookmarks/reorder", {
        method: "PATCH",
        token: writeToken,
        body: { categories: [{ categoryId, bookmarkIds: reversed }] },
      }),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ reordered: true });
    const after = await db.bookmark.findMany({
      where: { categoryId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(after.map((row) => row.id)).toEqual(reversed);
  });

  it("rejects a reorder naming a bookmark of another workspace", async () => {
    const response = await reorderBookmarks(
      request("/api/v1/bookmarks/reorder", {
        method: "PATCH",
        token: otherWorkspaceToken,
        body: { categories: [{ categoryId, bookmarkIds: [bookmarkId] }] },
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("bookmark categories", () => {
  it("lists the tree with counts and nests exactly one level", async () => {
    const child = await createCategory(
      request("/api/v1/bookmarks/categories", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-dashboards`, parentCategoryId: categoryId },
      }),
    );
    expect(child.status).toBe(201);
    const childId = (await body<{ id: string }>(child)).id;

    const listed = await listCategories(
      request("/api/v1/bookmarks/categories", { token: readToken }),
    );
    const tree =
      await body<Array<{ id: string; childCategories: Array<{ id: string }> }>>(
        listed,
      );
    const root = tree.find((entry) => entry.id === categoryId);
    expect(root?.childCategories.map((entry) => entry.id)).toEqual([childId]);

    const tooDeep = await createCategory(
      request("/api/v1/bookmarks/categories", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-too-deep`, parentCategoryId: childId },
      }),
    );
    expect(tooDeep.status).toBe(400);
    expect(
      await db.category.count({ where: { name: `${PREFIX}-too-deep` } }),
    ).toBe(0);
  });

  it("renames a category and promotes it back to top level", async () => {
    const created = await createCategory(
      request("/api/v1/bookmarks/categories", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-nested`, parentCategoryId: categoryId },
      }),
    );
    const { id } = await body<{ id: string }>(created);

    const promoted = await updateCategory(
      request(`/api/v1/bookmarks/categories/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-promoted`, parentCategoryId: null },
      }),
      params({ categoryId: id }),
    );

    expect(promoted.status).toBe(200);
    expect(
      await body<{ name: string; parentCategoryId: string | null }>(promoted),
    ).toMatchObject({
      name: `${PREFIX}-promoted`,
      parentCategoryId: null,
    });
  });

  it("answers 404 for a category of another workspace", async () => {
    const response = await updateCategory(
      request(`/api/v1/bookmarks/categories/${categoryId}`, {
        method: "PATCH",
        token: otherWorkspaceToken,
        body: { name: "Cross-tenant rename" },
      }),
      params({ categoryId }),
    );

    expect(response.status).toBe(404);
    const stored = await db.category.findUnique({ where: { id: categoryId } });
    expect(stored?.name).toBe(`${PREFIX}-runbooks`);
  });

  it("reorders the categories", async () => {
    const before = await db.category.findMany({
      where: { workspaceId, parentCategoryId: null },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const reversed = before.map((row) => row.id).reverse();

    const response = await reorderCategories(
      request("/api/v1/bookmarks/categories/reorder", {
        method: "PATCH",
        token: writeToken,
        body: { order: reversed },
      }),
    );

    expect(response.status).toBe(200);
    const after = await db.category.findMany({
      where: { id: { in: reversed } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(after.map((row) => row.id)).toEqual(reversed);
  });
});
