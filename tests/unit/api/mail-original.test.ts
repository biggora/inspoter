import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { authMock, originalMock, toErrorResponseMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  originalMock: vi.fn(),
  toErrorResponseMock: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({
  requireAuthWithWorkspaceHeader: authMock,
}));
vi.mock("@/lib/api/errors", () => ({
  toErrorResponse: toErrorResponseMock,
}));
vi.mock("@/lib/services/mail-original", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/mail-original")>()),
  getOriginalMessage: originalMock,
}));

import { GET } from "@/app/api/mail/[id]/original/route";
import { MailTransportError, MailboxUidValidityChangedError } from "@/lib/mail";
import {
  MailOriginalNotFoundError,
  MailOriginalUnavailableError,
  MailOriginalTooLargeError,
} from "@/lib/services/mail-original";

const request = () =>
  new NextRequest("http://localhost/api/mail/mail-1/original");
const context = { params: Promise.resolve({ id: "mail-1" }) };

describe("GET /api/mail/[id]/original", () => {
  beforeEach(() => {
    authMock
      .mockReset()
      .mockResolvedValue({ workspace: { id: "workspace-1" } });
    originalMock.mockReset();
    toErrorResponseMock
      .mockReset()
      .mockReturnValue(new NextResponse(null, { status: 401 }));
  });

  it("returns exact RFC822 bytes as a private attachment", async () => {
    const source = Buffer.from("Subject: Čau\r\n\r\nSveiki", "utf8");
    originalMock.mockResolvedValue(source);
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(source);
    expect(response.headers.get("content-type")).toBe("message/rfc822");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="message-mail-1.eml"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(originalMock).toHaveBeenCalledWith("mail-1", "workspace-1");
  });

  it("does not read message when workspace auth fails", async () => {
    authMock.mockRejectedValue(new Error("unauthorized"));
    const response = await GET(request(), context);

    expect(response.status).toBe(401);
    expect(originalMock).not.toHaveBeenCalled();
  });

  it.each([
    [new MailOriginalNotFoundError("mail-1"), 404, "errorOriginalUnavailable"],
    [new MailOriginalUnavailableError(), 409, "errorOriginalUnavailable"],
    [new MailboxUidValidityChangedError(), 409, "errorOriginalMailboxChanged"],
    [new MailOriginalTooLargeError(), 413, "errorOriginalTooLarge"],
    [
      new MailTransportError("private transport details"),
      502,
      "errorDownloadOriginal",
    ],
  ])(
    "maps %s to status %s with a localizable error",
    async (error, status, errorKey) => {
      originalMock.mockRejectedValue(error);
      const response = await GET(request(), context);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ errorKey });
    },
  );
});
