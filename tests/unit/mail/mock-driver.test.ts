import { beforeEach, describe, expect, it } from "vitest";

import {
  MockMailDriver,
  mockOutbox,
  resetMockMailStore,
} from "@/lib/mail/mock";
import type { OutgoingMessage } from "@/lib/mail/types";

// MockMailDriver contract (plan §2): deterministic per-storeKey in-memory
// store, mutations round-trip, send() captured in the exported outbox.

const KEY = "acc-mock-1";

function outgoing(overrides?: Partial<OutgoingMessage>): OutgoingMessage {
  return {
    from: { name: "Оператор", address: "operator@inspot.local" },
    to: [{ address: "anna.smirnova@example.ru" }],
    cc: [],
    bcc: [],
    subject: "Ответ на отчёт",
    text: "Спасибо, отчёт получил.",
    ...overrides,
  };
}

beforeEach(() => {
  resetMockMailStore();
});

describe("MockMailDriver", () => {
  it("is deterministic: two instances with the same key see the same data", async () => {
    const a = new MockMailDriver(KEY);
    const b = new MockMailDriver(KEY);

    const messagesA = await a.fetchMessages("INBOX", {});
    const messagesB = await b.fetchMessages("INBOX", {});
    expect(messagesA).toEqual(messagesB);
    expect(messagesA).toHaveLength(30);

    // Mutation through one instance is visible through the other.
    await a.setSeen("INBOX", 3n, true);
    const flags = await b.listUidsWithFlags("INBOX", [3n]);
    expect(flags.get(3n)?.isRead).toBe(true);
  });

  it("isolates stores by key", async () => {
    const a = new MockMailDriver(KEY);
    const other = new MockMailDriver("acc-mock-2");

    await a.setSeen("INBOX", 1n, true);
    const flags = await other.listUidsWithFlags("INBOX", [1n]);
    expect(flags.get(1n)?.isRead).toBe(false);
  });

  it("lists the seeded folders with special-use and uidValidity", async () => {
    const driver = new MockMailDriver(KEY);
    const folders = await driver.listFolders();

    expect(folders.map((f) => f.path)).toEqual([
      "INBOX",
      "Sent",
      "Trash",
      "Archive",
    ]);
    const inbox = folders[0];
    expect(inbox.name).toBe("Входящие");
    expect(inbox.specialUse).toBe("INBOX");
    expect(inbox.uidValidity).toBe(1n);
    expect(folders.map((f) => f.specialUse)).toEqual([
      "INBOX",
      "SENT",
      "TRASH",
      "ARCHIVE",
    ]);
  });

  it("seeds varied messages: html bodies, attachments, mixed read state", async () => {
    const driver = new MockMailDriver(KEY);
    const messages = await driver.fetchMessages("INBOX", {});

    expect(messages.some((m) => m.bodyHtml !== null)).toBe(true);
    expect(messages.some((m) => m.bodyHtml === null)).toBe(true);
    expect(messages.some((m) => m.isRead)).toBe(true);
    expect(messages.some((m) => !m.isRead)).toBe(true);
    const withAttachments = messages.filter((m) => m.attachments.length > 0);
    expect(withAttachments.length).toBeGreaterThanOrEqual(2);
    expect(withAttachments[0].attachments[0]).toMatchObject({
      partId: "2",
      contentType: "text/plain",
      isInline: false,
    });
    expect(messages.every((m) => m.snippet.length <= 120)).toBe(true);
  });

  it("honours initialLimit and afterUid in fetchMessages", async () => {
    const driver = new MockMailDriver(KEY);

    const initial = await driver.fetchMessages("INBOX", { initialLimit: 5 });
    expect(initial).toHaveLength(5);
    // Last 5 messages by uid (26..30).
    expect(initial.map((m) => m.uid)).toEqual([26n, 27n, 28n, 29n, 30n]);

    const incremental = await driver.fetchMessages("INBOX", { afterUid: 28n });
    expect(incremental.map((m) => m.uid)).toEqual([29n, 30n]);

    const empty = await driver.fetchMessages("INBOX", { afterUid: 30n });
    expect(empty).toEqual([]);
  });

  it("round-trips setSeen through listUidsWithFlags", async () => {
    const driver = new MockMailDriver(KEY);

    await driver.setSeen("INBOX", 1n, true);
    expect((await driver.listUidsWithFlags("INBOX", [1n])).get(1n)?.isRead).toBe(
      true,
    );

    await driver.setSeen("INBOX", 1n, false);
    expect((await driver.listUidsWithFlags("INBOX", [1n])).get(1n)?.isRead).toBe(
      false,
    );
  });

  it("omits unknown uids from listUidsWithFlags", async () => {
    const driver = new MockMailDriver(KEY);
    const flags = await driver.listUidsWithFlags("INBOX", [1n, 999n]);
    expect(flags.has(1n)).toBe(true);
    expect(flags.has(999n)).toBe(false);
  });

  it("moves messages between folders", async () => {
    const driver = new MockMailDriver(KEY);
    const [moved] = await driver.fetchMessages("INBOX", { initialLimit: 30 });

    await driver.move("INBOX", moved.uid, "Archive");

    const inbox = await driver.fetchMessages("INBOX", {});
    expect(inbox).toHaveLength(29);
    expect(inbox.some((m) => m.uid === moved.uid)).toBe(false);

    const archive = await driver.fetchMessages("Archive", {});
    expect(archive).toHaveLength(1);
    expect(archive[0].subject).toBe(moved.subject);
  });

  it("downloads deterministic attachment content", async () => {
    const driver = new MockMailDriver(KEY);
    const messages = await driver.fetchMessages("INBOX", {});
    const withAttachment = messages.find((m) => m.attachments.length > 0);
    expect(withAttachment).toBeDefined();

    const download = await driver.downloadAttachment(
      "INBOX",
      withAttachment!.uid,
      withAttachment!.attachments[0].partId,
    );
    expect(download.contentType).toBe("text/plain");
    expect(download.content.toString("utf8")).toContain("Содержимое вложения");
    expect(download.content.byteLength).toBe(
      withAttachment!.attachments[0].sizeBytes,
    );
  });

  it("captures send() in the outbox and round-trips append into Sent", async () => {
    const driver = new MockMailDriver(KEY);
    const message = outgoing();

    const { messageId, raw } = await driver.send(message);
    expect(mockOutbox).toEqual([message]);
    expect(messageId).toMatch(/^<mock-sent-1@/);

    await driver.append("Sent", raw, ["\\Seen"]);
    const sent = await driver.fetchMessages("Sent", {});
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Ответ на отчёт");
    expect(sent[0].messageId).toBe(messageId);
    expect(sent[0].isRead).toBe(true);
    expect(sent[0].bodyText).toContain("Спасибо, отчёт получил.");
  });

  it("verify() always succeeds for the mock transport", async () => {
    const driver = new MockMailDriver(KEY);
    expect(await driver.verify()).toEqual({
      imapOk: true,
      smtpOk: true,
      error: null,
    });
  });

  it("resetMockMailStore() reseeds stores and clears the outbox", async () => {
    const driver = new MockMailDriver(KEY);
    await driver.setSeen("INBOX", 1n, true);
    await driver.send(outgoing());
    expect(mockOutbox).toHaveLength(1);

    resetMockMailStore();

    expect(mockOutbox).toHaveLength(0);
    const flags = await new MockMailDriver(KEY).listUidsWithFlags("INBOX", [
      1n,
    ]);
    expect(flags.get(1n)?.isRead).toBe(false);
  });
});
