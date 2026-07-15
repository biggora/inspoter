import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { Operator, Workspace } from "@/generated/prisma/client";
import * as workspacesService from "@/lib/services/workspaces";
import * as bookmarksService from "@/lib/services/bookmarks";
import * as logsService from "@/lib/services/logs";
import * as alertsService from "@/lib/services/alerts";
import * as mailService from "@/lib/services/mail";
import * as messagesService from "@/lib/services/messages";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as bindingsService from "@/lib/services/bindings";

// R2.8: two-workspace/two-member all-section integration gate. Every
// resource created below lives in workspace A; each assertion verifies
// workspace B's workspace-scoped service calls cannot observe, mutate, or
// otherwise leak it (AC-WS-008/010/011).

const RUN_ID = randomUUID();

let operatorA: Operator;
let operatorB: Operator;
let workspaceA: Workspace;
let workspaceB: Workspace;

beforeAll(async () => {
  const passwordHash = await hashPassword("R2.8-integration-test-password");
  operatorA = await db.operator.create({
    data: { username: `r28-op-a-${RUN_ID}`, passwordHash },
  });
  operatorB = await db.operator.create({
    data: { username: `r28-op-b-${RUN_ID}`, passwordHash },
  });

  workspaceA = await workspacesService.createWorkspace(operatorA.id, {
    name: `R2.8 Workspace A ${RUN_ID}`,
  });
  workspaceB = await workspacesService.createWorkspace(operatorB.id, {
    name: `R2.8 Workspace B ${RUN_ID}`,
  });
});

afterAll(async () => {
  // ProviderResourceBinding.workspace is onDelete: Restrict, so bindings
  // must be cleared before the owning workspaces can be deleted.
  await db.providerResourceBinding.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  });
  await db.workspace
    .delete({ where: { id: workspaceA.id } })
    .catch(() => {});
  await db.workspace
    .delete({ where: { id: workspaceB.id } })
    .catch(() => {});
  await db.operator.delete({ where: { id: operatorA.id } }).catch(() => {});
  await db.operator.delete({ where: { id: operatorB.id } }).catch(() => {});
});

describe("AC-WS-008/010/011: Bookmarks isolation", () => {
  it("workspace B's list() does not include workspace A's category or bookmark", async () => {
    const category = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-cat-${RUN_ID}`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceA.id, {
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: category.id,
    });

    const wsBGrouped = await bookmarksService.list(workspaceB.id);
    expect(wsBGrouped.some((c) => c.id === category.id)).toBe(false);
    expect(
      wsBGrouped.some((c) =>
        c.bookmarks.some((b) => b.id === bookmark.id),
      ),
    ).toBe(false);

    const wsAGrouped = await bookmarksService.list(workspaceA.id);
    expect(wsAGrouped.some((c) => c.id === category.id)).toBe(true);
  });

  it("createCategory in workspace A rejects a parentCategoryId belonging to workspace B, with no partial write", async () => {
    const categoryB = await bookmarksService.createCategory(workspaceB.id, {
      name: `bm-cross-parent-b-${RUN_ID}`,
    });

    await expect(
      bookmarksService.createCategory(workspaceA.id, {
        name: `bm-cross-parent-a-create-${RUN_ID}`,
        parentCategoryId: categoryB.id,
      }),
    ).rejects.toThrow(bookmarksService.CategoryHierarchyValidationError);

    const wsAGrouped = await bookmarksService.list(workspaceA.id);
    expect(
      wsAGrouped.some(
        (c) => c.name === `bm-cross-parent-a-create-${RUN_ID}`,
      ),
    ).toBe(false);
    const created = await db.category.findFirst({
      where: { name: `bm-cross-parent-a-create-${RUN_ID}` },
    });
    expect(created).toBeNull();
  });

  it("renameCategory in workspace A rejects a parentCategoryId belonging to workspace B, with no partial write", async () => {
    const categoryB = await bookmarksService.createCategory(workspaceB.id, {
      name: `bm-cross-parent-b-rename-${RUN_ID}`,
    });
    const categoryA = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-cross-parent-a-rename-${RUN_ID}`,
    });

    await expect(
      bookmarksService.renameCategory(categoryA.id, workspaceA.id, {
        name: categoryA.name,
        parentCategoryId: categoryB.id,
      }),
    ).rejects.toThrow(bookmarksService.CategoryHierarchyValidationError);

    const unchanged = await db.category.findUnique({
      where: { id: categoryA.id },
    });
    expect(unchanged?.parentCategoryId).toBeNull();
    expect(unchanged?.name).toBe(`bm-cross-parent-a-rename-${RUN_ID}`);
  });

  it("creating a bookmark in workspace B against workspace A's categoryId fails the FK constraint", async () => {
    const categoryA = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-cross-cat-${RUN_ID}`,
    });

    await expect(
      bookmarksService.createBookmark(workspaceB.id, {
        name: "Cross-workspace bookmark",
        url: "https://cross.example.com",
        categoryId: categoryA.id,
      }),
    ).rejects.toThrow();
  });
});

describe("Bookmarks reorder isolation", () => {
  it("reorderCategories rejects a workspace-B category id and leaves workspace A's category positions unchanged", async () => {
    const categoryA1 = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-reorder-cat-a1-${RUN_ID}`,
    });
    const categoryA2 = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-reorder-cat-a2-${RUN_ID}`,
    });
    // Throwaway category in workspace B, purely to get a real (but
    // foreign) id for the rejected order array below.
    const categoryB = await bookmarksService.createCategory(workspaceB.id, {
      name: `bm-reorder-cat-b-${RUN_ID}`,
    });

    const before = await bookmarksService.list(workspaceA.id);
    const positionBeforeA1 = before.find((c) => c.id === categoryA1.id)
      ?.position;
    const positionBeforeA2 = before.find((c) => c.id === categoryA2.id)
      ?.position;
    expect(positionBeforeA1).toBeDefined();
    expect(positionBeforeA2).toBeDefined();

    await expect(
      bookmarksService.reorderCategories(workspaceA.id, [
        categoryA2.id,
        categoryB.id,
        categoryA1.id,
      ]),
    ).rejects.toThrow(bookmarksService.BookmarkReorderValidationError);

    const after = await bookmarksService.list(workspaceA.id);
    expect(after.find((c) => c.id === categoryA1.id)?.position).toBe(
      positionBeforeA1,
    );
    expect(after.find((c) => c.id === categoryA2.id)?.position).toBe(
      positionBeforeA2,
    );
  });

  it("reorderBookmarks rejects a workspace-B bookmark id and leaves workspace A's bookmark position/categoryId unchanged", async () => {
    const categoryA = await bookmarksService.createCategory(workspaceA.id, {
      name: `bm-reorder-bcat-a-${RUN_ID}`,
    });
    const bookmarkA = await bookmarksService.createBookmark(workspaceA.id, {
      name: "Reorder A",
      url: "https://reorder-a.example.com",
      categoryId: categoryA.id,
    });
    // Throwaway category + bookmark in workspace B, purely to get a real
    // (but foreign) bookmark id for the rejected payload below.
    const categoryB = await bookmarksService.createCategory(workspaceB.id, {
      name: `bm-reorder-bcat-b-${RUN_ID}`,
    });
    const bookmarkB = await bookmarksService.createBookmark(workspaceB.id, {
      name: "Reorder B",
      url: "https://reorder-b.example.com",
      categoryId: categoryB.id,
    });

    const before = await bookmarksService.list(workspaceA.id);
    const beforeBookmarkA = before
      .find((c) => c.id === categoryA.id)
      ?.bookmarks.find((b) => b.id === bookmarkA.id);
    expect(beforeBookmarkA).toBeDefined();

    await expect(
      bookmarksService.reorderBookmarks(workspaceA.id, [
        {
          categoryId: categoryA.id,
          bookmarkIds: [bookmarkA.id, bookmarkB.id],
        },
      ]),
    ).rejects.toThrow(bookmarksService.BookmarkReorderValidationError);

    const after = await bookmarksService.list(workspaceA.id);
    const afterBookmarkA = after
      .find((c) => c.id === categoryA.id)
      ?.bookmarks.find((b) => b.id === bookmarkA.id);
    expect(afterBookmarkA?.position).toBe(beforeBookmarkA?.position);
    expect(afterBookmarkA?.categoryId).toBe(categoryA.id);
  });
});

describe("Logs isolation", () => {
  it("workspace B's list() does not include workspace A's log entries", async () => {
    const marker = `log-${RUN_ID}`;
    await logsService.create(workspaceA.id, {
      level: "info",
      source: "isolation-test",
      message: marker,
    });

    const wsBResult = await logsService.list(workspaceB.id, {});
    expect(wsBResult.items.some((i) => i.message === marker)).toBe(false);
    expect(
      wsBResult.items.every((i) => i.workspaceId === workspaceB.id),
    ).toBe(true);

    const wsAResult = await logsService.list(workspaceA.id, {});
    expect(wsAResult.items.some((i) => i.message === marker)).toBe(true);
  });
});

describe("Alerts isolation", () => {
  it("workspace B's list()/listCategories() do not include workspace A's alerts or categories", async () => {
    const marker = `alert-${RUN_ID}`;
    const categoryName = `alert-cat-${RUN_ID}`;
    await alertsService.create(workspaceA.id, {
      category: categoryName,
      severity: "critical",
      source: "isolation-test",
      message: marker,
    });

    const wsBAlerts = await alertsService.list(workspaceB.id, {});
    expect(wsBAlerts.items.some((i) => i.message === marker)).toBe(false);

    const wsBCategories = await alertsService.listCategories(workspaceB.id);
    expect(wsBCategories.some((c) => c.name === categoryName)).toBe(false);

    const wsACategories = await alertsService.listCategories(workspaceA.id);
    expect(wsACategories.some((c) => c.name === categoryName)).toBe(true);
  });
});

describe("Mail isolation", () => {
  it("workspace B's list()/getById() do not surface workspace A's mail item", async () => {
    const marker = `mail-${RUN_ID}`;
    const mail = await mailService.create(workspaceA.id, {
      sender: "sender@example.com",
      subject: marker,
      body: "isolation test body",
    });

    const wsBList = await mailService.list(workspaceB.id, {});
    expect(wsBList.items.some((i) => i.subject === marker)).toBe(false);

    const wsBGetById = await mailService.getById(mail.id, workspaceB.id);
    expect(wsBGetById).toBeNull();

    const wsAGetById = await mailService.getById(mail.id, workspaceA.id);
    expect(wsAGetById?.subject).toBe(marker);
  });
});

describe("Messages isolation", () => {
  it("workspace B's listCategories() omits workspace A's category, and cross-workspace createMessage throws ChannelNotFoundError", async () => {
    const category = await messagesService.createCategory(
      workspaceA.id,
      `msg-cat-${RUN_ID}`,
    );
    const channel = await messagesService.createChannel(
      workspaceA.id,
      category.id,
      `msg-chan-${RUN_ID}`,
    );
    await messagesService.createMessage(workspaceA.id, {
      channelId: channel.id,
      content: `msg-${RUN_ID}`,
    });

    const wsBCategories = await messagesService.listCategories(
      workspaceB.id,
    );
    expect(wsBCategories.some((c) => c.id === category.id)).toBe(false);

    await expect(
      messagesService.createMessage(workspaceB.id, {
        channelId: channel.id,
        content: "cross-workspace message",
      }),
    ).rejects.toThrow(messagesService.ChannelNotFoundError);
  });
});

describe("Webhook tokens isolation", () => {
  it("workspace B's list() does not include workspace A's token", async () => {
    const marker = `token-${RUN_ID}`;
    await webhookTokensService.create(workspaceA.id, marker);

    const wsBTokens = await webhookTokensService.list(workspaceB.id);
    expect(wsBTokens.some((t) => t.name === marker)).toBe(false);

    const wsATokens = await webhookTokensService.list(workspaceA.id);
    expect(wsATokens.some((t) => t.name === marker)).toBe(true);
  });
});

describe("Workspace member role boundaries", () => {
  it("operator B cannot update workspace A", async () => {
    await expect(
      workspacesService.updateWorkspace(workspaceA.id, operatorB.id, {
        name: "Hijacked name",
      }),
    ).rejects.toThrow(workspacesService.WorkspaceAuthorizationError);
  });

  it("operator B cannot delete workspace A", async () => {
    await expect(
      workspacesService.deleteWorkspace(workspaceA.id, operatorB.id),
    ).rejects.toThrow(workspacesService.WorkspaceAuthorizationError);
  });

  it("operator B cannot add members to workspace A", async () => {
    await expect(
      workspacesService.addMember(
        workspaceA.id,
        { username: `intruder-${RUN_ID}`, password: "Password123!" },
        operatorB.id,
      ),
    ).rejects.toThrow(workspacesService.WorkspaceAuthorizationError);
  });
});

describe("Cross-workspace cursor replay", () => {
  it("a cursor minted for workspace A logs is silently discarded when used against workspace B", async () => {
    for (let i = 0; i < 3; i++) {
      await logsService.create(workspaceA.id, {
        level: "info",
        source: "cursor-test",
        message: `cursor-log-${RUN_ID}-${i}`,
      });
    }
    const wsAPage1 = await logsService.list(workspaceA.id, { pageSize: 1 });
    expect(wsAPage1.nextCursor).not.toBeNull();

    await logsService.create(workspaceB.id, {
      level: "info",
      source: "cursor-test",
      message: `cursor-log-b-${RUN_ID}`,
    });

    const wsBWithForeignCursor = await logsService.list(workspaceB.id, {
      cursor: wsAPage1.nextCursor!,
    });
    const wsBFirstPage = await logsService.list(workspaceB.id, {});

    expect(wsBWithForeignCursor.items.map((i) => i.id)).toEqual(
      wsBFirstPage.items.map((i) => i.id),
    );
  });
});

describe("Provider resource bindings isolation", () => {
  it("each workspace only sees its own bindings, and getBinding throws BindingNotFoundError cross-workspace", async () => {
    const bindingA = await bindingsService.claimBinding(
      workspaceA.id,
      "hetzner",
      "SERVER",
      "MOCK",
      `mock:v1:${workspaceA.id}:hetzner:${RUN_ID}-a`,
      `Binding A ${RUN_ID}`,
    );
    const bindingB = await bindingsService.claimBinding(
      workspaceB.id,
      "hetzner",
      "SERVER",
      "MOCK",
      `mock:v1:${workspaceB.id}:hetzner:${RUN_ID}-b`,
      `Binding B ${RUN_ID}`,
    );

    const wsABindings = await bindingsService.listBindings(workspaceA.id);
    const wsBBindings = await bindingsService.listBindings(workspaceB.id);

    expect(wsABindings.some((b) => b.id === bindingA.id)).toBe(true);
    expect(wsABindings.some((b) => b.id === bindingB.id)).toBe(false);
    expect(wsBBindings.some((b) => b.id === bindingB.id)).toBe(true);
    expect(wsBBindings.some((b) => b.id === bindingA.id)).toBe(false);

    await expect(
      bindingsService.getBinding(bindingA.id, workspaceB.id),
    ).rejects.toThrow(bindingsService.BindingNotFoundError);
  });
});
