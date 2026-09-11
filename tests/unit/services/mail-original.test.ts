import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, getMailDriverMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  getMailDriverMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { mailItem: { findFirst: findFirstMock } },
}));
vi.mock("@/lib/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail")>()),
  getMailDriver: getMailDriverMock,
}));

import { env } from "@/lib/config/env";
import {
  getOriginalMessage,
  MailOriginalNotFoundError,
  MailOriginalTooLargeError,
  MailOriginalUnavailableError,
} from "@/lib/services/mail-original";

const item = {
  account: { id: "account-1", kind: "IMAP" },
  folder: { path: "INBOX", uidValidity: 42n },
  uid: 7n,
  sourceSizeBytes: 12n,
};

describe("getOriginalMessage", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    getMailDriverMock.mockReset();
  });

  it("scopes lookup to workspace and returns exact source bytes", async () => {
    const source = Buffer.from("Subject: Čau\r\n\r\nSveiki", "utf8");
    const close = vi.fn().mockResolvedValue(undefined);
    const downloadOriginal = vi.fn().mockResolvedValue(source);
    findFirstMock.mockResolvedValue(item);
    getMailDriverMock.mockResolvedValue({ downloadOriginal, close });

    await expect(getOriginalMessage("mail-1", "workspace-1")).resolves.toEqual(
      source,
    );
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "mail-1", workspaceId: "workspace-1" },
      include: { account: true, folder: true },
    });
    expect(downloadOriginal).toHaveBeenCalledWith(
      "INBOX",
      7n,
      42n,
      env.MAIL_MAX_MESSAGE_BYTES,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("hides absent and cross-workspace items behind same not-found error", async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(
      getOriginalMessage("mail-1", "wrong-workspace"),
    ).rejects.toBeInstanceOf(MailOriginalNotFoundError);
    expect(getMailDriverMock).not.toHaveBeenCalled();
  });

  it("rejects items without stable IMAP identity", async () => {
    findFirstMock.mockResolvedValue({ ...item, uid: null });
    await expect(
      getOriginalMessage("mail-1", "workspace-1"),
    ).rejects.toBeInstanceOf(MailOriginalUnavailableError);
  });

  it("rejects known oversized messages before opening transport", async () => {
    findFirstMock.mockResolvedValue({
      ...item,
      sourceSizeBytes: BigInt(env.MAIL_MAX_MESSAGE_BYTES + 1),
    });
    await expect(
      getOriginalMessage("mail-1", "workspace-1"),
    ).rejects.toBeInstanceOf(MailOriginalTooLargeError);
    expect(getMailDriverMock).not.toHaveBeenCalled();
  });

  it("rejects oversized downloaded bytes and still closes transport", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    findFirstMock.mockResolvedValue({ ...item, sourceSizeBytes: null });
    getMailDriverMock.mockResolvedValue({
      downloadOriginal: vi
        .fn()
        .mockResolvedValue(Buffer.alloc(env.MAIL_MAX_MESSAGE_BYTES + 1)),
      close,
    });
    await expect(
      getOriginalMessage("mail-1", "workspace-1"),
    ).rejects.toBeInstanceOf(MailOriginalTooLargeError);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes transport when the download fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    findFirstMock.mockResolvedValue(item);
    getMailDriverMock.mockResolvedValue({
      downloadOriginal: vi.fn().mockRejectedValue(new Error("offline")),
      close,
    });
    await expect(getOriginalMessage("mail-1", "workspace-1")).rejects.toThrow(
      "offline",
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
