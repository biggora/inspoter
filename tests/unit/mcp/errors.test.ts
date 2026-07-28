import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/config/env", () => ({
  env: { LIST_PAGE_SIZE: 50, MAIL_SEND_RATE_LIMIT: 10 },
}));
vi.mock("@/lib/services/logs", () => ({ logError: mocks.logError }));

import { McpResourceNotFoundError, toToolError } from "@/lib/mcp/errors";
import { Prisma } from "@/generated/prisma/client";
import { MailSendNotAllowedError } from "@/lib/services/mail-actions";
import { ServiceNotFoundError } from "@/lib/services/services";

const CONTEXT = { workspaceId: "ws-1", toolName: "mail_send" };

function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}

describe("toToolError", () => {
  beforeEach(() => {
    mocks.logError.mockClear();
  });

  it("passes an expected domain error's message through without logging", () => {
    const result = toToolError(new MailSendNotAllowedError(), CONTEXT);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(new MailSendNotAllowedError().message);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("passes the MCP not-found error through", () => {
    const result = toToolError(
      new McpResourceNotFoundError("Service", "svc-1"),
      CONTEXT,
    );

    expect(textOf(result)).toBe("Service not found: svc-1");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("recognizes service errors raised by the service layer", () => {
    const result = toToolError(new ServiceNotFoundError("svc-2"), CONTEXT);

    expect(textOf(result)).toContain("svc-2");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("treats a foreign-key violation as bad input, not a server fault", () => {
    // What a cross-workspace categoryId produces on bookmark_create.
    const result = toToolError(
      new Prisma.PrismaClientKnownRequestError("FK violated", {
        code: "P2003",
        clientVersion: "7.9.0",
      }),
      { workspaceId: "ws-1", toolName: "bookmark_create" },
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("does not exist in this workspace");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("logs an unexpected error and hides its details from the client", () => {
    const boom = new Error("connect ECONNREFUSED 10.0.0.1:5432");

    const result = toToolError(boom, CONTEXT);

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("ECONNREFUSED");
    expect(textOf(result)).not.toContain("at ");
    expect(textOf(result)).toContain("mail_send");

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    const [workspaceId, source, message, details] =
      mocks.logError.mock.calls[0];
    expect(workspaceId).toBe("ws-1");
    expect(source).toBe("mcp");
    expect(message).toContain("mail_send");
    expect(JSON.parse(details as string)).toMatchObject({
      name: "Error",
      tool: "mail_send",
      message: "connect ECONNREFUSED 10.0.0.1:5432",
    });
  });

  it("handles a thrown non-Error value", () => {
    const result = toToolError("something odd", CONTEXT);

    expect(result.isError).toBe(true);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });
});
