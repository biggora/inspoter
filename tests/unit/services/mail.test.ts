import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as mailService from "@/lib/services/mail";

const NAME_PREFIX = `mail-${randomUUID()}`;
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

describe("AC-MAIL-001/002: create()", () => {
  it("creates a mail item with sender, subject, and body", async () => {
    const sender = `${NAME_PREFIX}-alice@example.com`;
    const mail = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-subject-basic`,
      body: "Hello, this is the body.",
    });

    const stored = await db.mailItem.findUnique({ where: { id: mail.id } });
    expect(stored?.fromAddress).toBe(sender);
    expect(stored?.subject).toBe(`${NAME_PREFIX}-subject-basic`);
    expect(stored?.bodyText).toBe("Hello, this is the body.");
    expect(stored?.isRead).toBe(false);
    expect(stored?.snippet).toBe("Hello, this is the body.");
  });

  it("stores the provided receivedAt instead of defaulting to now", async () => {
    const explicitDate = new Date("2020-06-01T12:00:00.000Z");
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-bob@example.com`,
      subject: `${NAME_PREFIX}-subject-explicit-date`,
      body: "Body with explicit receivedAt.",
      receivedAt: explicitDate.toISOString(),
    });

    const stored = await db.mailItem.findUnique({ where: { id: mail.id } });
    expect(stored?.receivedAt.toISOString()).toBe(explicitDate.toISOString());
  });
});

describe("Webhook mailbox: create() auto-provisions the system account", () => {
  it("creates the WEBHOOK account + INBOX folder once and reuses them", async () => {
    const first = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-webhook-account-1@example.com`,
      subject: `${NAME_PREFIX}-webhook-account-1`,
      body: "first webhook mail",
    });
    const second = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-webhook-account-2@example.com`,
      subject: `${NAME_PREFIX}-webhook-account-2`,
      body: "second webhook mail",
    });

    const accounts = await db.mailAccount.findMany({
      where: { workspaceId, kind: "WEBHOOK" },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Webhook");
    expect(accounts[0].mode).toBe("REAL");

    const folders = await db.mailFolder.findMany({
      where: { accountId: accounts[0].id },
    });
    expect(folders).toHaveLength(1);
    expect(folders[0].path).toBe("INBOX");
    expect(folders[0].name).toBe("Входящие");
    expect(folders[0].specialUse).toBe("INBOX");

    const storedFirst = await db.mailItem.findUnique({
      where: { id: first.id },
    });
    const storedSecond = await db.mailItem.findUnique({
      where: { id: second.id },
    });
    expect(storedFirst?.accountId).toBe(accounts[0].id);
    expect(storedFirst?.folderId).toBe(folders[0].id);
    expect(storedSecond?.accountId).toBe(accounts[0].id);
    expect(storedSecond?.folderId).toBe(folders[0].id);
  });

  it("collapses whitespace and truncates the snippet to 120 chars", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-snippet@example.com`,
      subject: `${NAME_PREFIX}-snippet`,
      body: `  line one\n\n${"x".repeat(200)}  `,
    });

    const stored = await db.mailItem.findUnique({ where: { id: mail.id } });
    expect(stored?.snippet).toBe(`line one ${"x".repeat(111)}`);
    expect(stored?.snippet).toHaveLength(120);
  });
});

describe("AC-MAIL-001/005: list() keyset cursor pagination", () => {
  it("paginates ascending and descending with stable ordering and no duplicates/omissions", async () => {
    const sender = `${NAME_PREFIX}-pagination@example.com`;
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const mail = await mailService.create(workspaceId, {
        sender,
        subject: `${NAME_PREFIX}-pagination-${i}`,
        body: "pagination body",
      });
      created.push(mail.id);
    }

    const page1 = await mailService.list(workspaceId, {
      from: sender,
      pageSize: 2,
      sort: "desc",
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await mailService.list(workspaceId, {
      from: sender,
      pageSize: 2,
      sort: "desc",
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await mailService.list(workspaceId, {
      from: sender,
      pageSize: 2,
      sort: "desc",
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allDescIds = [...page1.items, ...page2.items, ...page3.items].map(
      (m) => m.id,
    );
    expect(new Set(allDescIds).size).toBe(5);
    expect(allDescIds.sort()).toEqual([...created].sort());

    const ascPage1 = await mailService.list(workspaceId, {
      from: sender,
      pageSize: 2,
      sort: "asc",
    });
    expect(ascPage1.items.map((m) => m.subject)).toEqual([
      `${NAME_PREFIX}-pagination-0`,
      `${NAME_PREFIX}-pagination-1`,
    ]);

    const ascPage2 = await mailService.list(workspaceId, {
      from: sender,
      pageSize: 2,
      sort: "asc",
      cursor: ascPage1.nextCursor!,
    });
    expect(ascPage2.items.map((m) => m.subject)).toEqual([
      `${NAME_PREFIX}-pagination-2`,
      `${NAME_PREFIX}-pagination-3`,
    ]);
  });
});

describe("AC-MAIL-003: filter by sender and query", () => {
  it("filters by exact sender", async () => {
    const senderA = `${NAME_PREFIX}-sender-a@example.com`;
    const senderB = `${NAME_PREFIX}-sender-b@example.com`;
    const mailA = await mailService.create(workspaceId, {
      sender: senderA,
      subject: `${NAME_PREFIX}-from-a`,
      body: "from sender a",
    });
    const mailB = await mailService.create(workspaceId, {
      sender: senderB,
      subject: `${NAME_PREFIX}-from-b`,
      body: "from sender b",
    });

    const { items } = await mailService.list(workspaceId, { from: senderA });
    expect(items.some((m) => m.id === mailA.id)).toBe(true);
    expect(items.some((m) => m.id === mailB.id)).toBe(false);
  });

  it("filters by text query matching the subject", async () => {
    const sender = `${NAME_PREFIX}-query-subject@example.com`;
    const matching = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-needle-subject`,
      body: "irrelevant body",
    });
    const nonMatching = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-haystack-subject`,
      body: "irrelevant body",
    });

    const { items } = await mailService.list(workspaceId, {
      query: `${NAME_PREFIX}-needle`,
    });
    expect(items.some((m) => m.id === matching.id)).toBe(true);
    expect(items.some((m) => m.id === nonMatching.id)).toBe(false);
  });

  it("filters by text query matching the sender", async () => {
    const uniqueSender = `${NAME_PREFIX}-needle-sender@example.com`;
    const matching = await mailService.create(workspaceId, {
      sender: uniqueSender,
      subject: `${NAME_PREFIX}-sender-query-subject`,
      body: "irrelevant body",
    });
    const nonMatching = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-other-sender@example.com`,
      subject: `${NAME_PREFIX}-sender-query-subject-2`,
      body: "irrelevant body",
    });

    const { items } = await mailService.list(workspaceId, {
      query: `${NAME_PREFIX}-needle-sender`,
    });
    expect(items.some((m) => m.id === matching.id)).toBe(true);
    expect(items.some((m) => m.id === nonMatching.id)).toBe(false);
  });
});

describe("AC-MAIL-002: getById with workspace scope", () => {
  it("returns the mail item when requested within its own workspace", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-getbyid@example.com`,
      subject: `${NAME_PREFIX}-getbyid-subject`,
      body: "get by id body",
    });

    const found = await mailService.getById(mail.id, workspaceId);
    expect(found?.id).toBe(mail.id);
  });

  it("returns null when the mail item belongs to a different workspace", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-getbyid-wrong-ws@example.com`,
      subject: `${NAME_PREFIX}-getbyid-wrong-ws-subject`,
      body: "get by id wrong workspace body",
    });

    const found = await mailService.getById(mail.id, workspaceBId);
    expect(found).toBeNull();
  });

  it("returns null for a non-existent id", async () => {
    const found = await mailService.getById(
      "non-existent-mail-id",
      workspaceId,
    );
    expect(found).toBeNull();
  });
});

describe("Workspace isolation", () => {
  it("mail items from workspace A are not visible in workspace B", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-isolation@example.com`,
      subject: `${NAME_PREFIX}-isolation-subject`,
      body: "isolated body",
    });

    const { items } = await mailService.list(workspaceBId, {
      from: `${NAME_PREFIX}-isolation@example.com`,
    });
    expect(items.some((m) => m.id === mail.id)).toBe(false);
  });
});

describe("Cursor workspace-binding", () => {
  it("silently resets a cursor minted for workspace A when queried against workspace B", async () => {
    const senderA = `${NAME_PREFIX}-cursor-binding-a@example.com`;
    for (let i = 0; i < 3; i++) {
      await mailService.create(workspaceId, {
        sender: senderA,
        subject: `${NAME_PREFIX}-bound-a-${i}`,
        body: "cursor binding body a",
      });
    }

    const senderB = `${NAME_PREFIX}-cursor-binding-b@example.com`;
    for (let i = 0; i < 3; i++) {
      await mailService.create(workspaceBId, {
        sender: senderB,
        subject: `${NAME_PREFIX}-bound-b-${i}`,
        body: "cursor binding body b",
      });
    }

    const page1A = await mailService.list(workspaceId, {
      from: senderA,
      pageSize: 1,
      sort: "desc",
    });
    expect(page1A.nextCursor).not.toBeNull();

    const withForeignCursor = await mailService.list(workspaceBId, {
      from: senderB,
      pageSize: 1,
      sort: "desc",
      cursor: page1A.nextCursor!,
    });
    const withoutCursor = await mailService.list(workspaceBId, {
      from: senderB,
      pageSize: 1,
      sort: "desc",
    });

    expect(withForeignCursor.items.map((m) => m.id)).toEqual(
      withoutCursor.items.map((m) => m.id),
    );
  });
});

describe("Phase 5: list projection and account/folder/unread filters", () => {
  it("returns a metadata-only projection without bodies", async () => {
    const sender = `${NAME_PREFIX}-projection@example.com`;
    await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-projection-subject`,
      body: "projection body",
    });

    const { items } = await mailService.list(workspaceId, { from: sender });
    expect(items).toHaveLength(1);
    expect(items[0].fromAddress).toBe(sender);
    expect(items[0].snippet).toBe("projection body");
    expect(items[0]).not.toHaveProperty("bodyText");
    expect(items[0]).not.toHaveProperty("bodyHtml");
    expect(items[0]).not.toHaveProperty("uid");
  });

  it("filters by folderId and accountId", async () => {
    const sender = `${NAME_PREFIX}-folder-filter@example.com`;
    const inboxMail = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-folder-filter-inbox`,
      body: "inbox body",
    });

    const account = await db.mailAccount.findFirst({
      where: { workspaceId, kind: "WEBHOOK" },
    });
    expect(account).not.toBeNull();
    const archiveFolder = await db.mailFolder.create({
      data: {
        workspaceId,
        accountId: account!.id,
        accountWorkspaceId: workspaceId,
        path: `${NAME_PREFIX}-Archive`,
        name: "Архив",
        specialUse: "ARCHIVE",
        position: 5,
      },
    });
    const archivedMail = await db.mailItem.create({
      data: {
        workspaceId,
        accountId: account!.id,
        accountWorkspaceId: workspaceId,
        folderId: archiveFolder.id,
        folderWorkspaceId: workspaceId,
        fromAddress: sender,
        subject: `${NAME_PREFIX}-folder-filter-archived`,
        bodyText: "archived body",
        snippet: "archived body",
      },
    });

    const inFolder = await mailService.list(workspaceId, {
      folderId: archiveFolder.id,
    });
    expect(inFolder.items.map((m) => m.id)).toEqual([archivedMail.id]);

    const inAccount = await mailService.list(workspaceId, {
      accountId: account!.id,
      from: sender,
    });
    const inAccountIds = inAccount.items.map((m) => m.id);
    expect(inAccountIds).toContain(inboxMail.id);
    expect(inAccountIds).toContain(archivedMail.id);
  });

  it("unreadOnly returns only unread items", async () => {
    const sender = `${NAME_PREFIX}-unread-filter@example.com`;
    const unread = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-unread-filter-unread`,
      body: "unread body",
    });
    const read = await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-unread-filter-read`,
      body: "read body",
    });
    await db.mailItem.update({
      where: { id: read.id },
      data: { isRead: true },
    });

    const { items } = await mailService.list(workspaceId, {
      from: sender,
      unreadOnly: true,
    });
    expect(items.map((m) => m.id)).toEqual([unread.id]);
  });

  it("query matches fromName case-insensitively", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-named@example.com`,
      subject: `${NAME_PREFIX}-named-subject`,
      body: "named body",
    });
    await db.mailItem.update({
      where: { id: mail.id },
      data: { fromName: `${NAME_PREFIX}-John-Smith` },
    });

    const { items } = await mailService.list(workspaceId, {
      query: `${NAME_PREFIX}-john`,
    });
    expect(items.some((m) => m.id === mail.id)).toBe(true);
  });
});

describe("Phase 5: getById detail + DTO mappers", () => {
  it("returns account kind, recipients, and attachment metadata; DTOs omit BigInt uid", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-detail@example.com`,
      subject: `${NAME_PREFIX}-detail-subject`,
      body: "detail body",
    });
    await db.mailItem.update({
      where: { id: mail.id },
      data: {
        fromName: "Отправитель",
        toRecipients: [{ name: "Оператор", address: "op@example.com" }],
        ccRecipients: [{ name: null, address: "cc@example.com" }],
        bodyHtml: "<p>detail html</p>",
        hasAttachments: true,
      },
    });
    await db.mailAttachment.create({
      data: {
        mailItemId: mail.id,
        filename: "doc.txt",
        contentType: "text/plain",
        sizeBytes: 10,
        isInline: false,
      },
    });

    const detail = await mailService.getById(mail.id, workspaceId);
    expect(detail).not.toBeNull();
    expect(detail!.account.kind).toBe("WEBHOOK");

    const dto = mailService.toMailDetailDto(detail!);
    expect(dto.accountKind).toBe("WEBHOOK");
    expect(dto.from).toBe(`${NAME_PREFIX}-detail@example.com`);
    expect(dto.fromName).toBe("Отправитель");
    expect(dto.to).toEqual([{ name: "Оператор", address: "op@example.com" }]);
    expect(dto.cc).toEqual([{ name: null, address: "cc@example.com" }]);
    expect(dto.bodyText).toBe("detail body");
    expect(dto.bodyHtml).toBe("<p>detail html</p>");
    expect(dto.attachments).toEqual([
      expect.objectContaining({
        filename: "doc.txt",
        contentType: "text/plain",
        sizeBytes: 10,
        isInline: false,
      }),
    ]);
    expect(dto).not.toHaveProperty("uid");
    // The DTO must survive JSON serialization (no BigInt anywhere).
    expect(() => JSON.stringify(dto)).not.toThrow();
  });

  it("toMailListItemDto renames fromAddress to from and carries no body", async () => {
    const sender = `${NAME_PREFIX}-list-dto@example.com`;
    await mailService.create(workspaceId, {
      sender,
      subject: `${NAME_PREFIX}-list-dto-subject`,
      body: "list dto body",
    });

    const { items } = await mailService.list(workspaceId, { from: sender });
    const dto = mailService.toMailListItemDto(items[0]);
    expect(dto.from).toBe(sender);
    expect(dto.subject).toBe(`${NAME_PREFIX}-list-dto-subject`);
    expect(dto.snippet).toBe("list dto body");
    expect(dto).not.toHaveProperty("bodyText");
    expect(dto).not.toHaveProperty("body");
    expect(() => JSON.stringify(dto)).not.toThrow();
  });
});
