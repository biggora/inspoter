import type { CallToolResult } from "@modelcontextprotocol/server";
import { Prisma } from "@/generated/prisma/client";
import { MailTransportError } from "@/lib/mail";
import { MailListResourceNotFoundError } from "@/lib/services/mail";
import {
  MailFolderMismatchError,
  MailItemNotFoundError,
  MailSendNotAllowedError,
  MailSendRateLimitError,
} from "@/lib/services/mail-actions";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import {
  MailDraftContextNotFoundError,
  MailDraftFolderUnavailableError,
  MailDraftNotFoundError,
} from "@/lib/services/mail-drafts";
import { ServiceNotFoundError } from "@/lib/services/services";
import { CategoryHierarchyValidationError } from "@/lib/services/bookmarks";
import { logError } from "@/lib/services/logs";

// Domain errors a tool call can legitimately hit (bad id, wrong account kind,
// rate limit) are handed back to the model as `isError` results with their own
// message, so it can correct itself. Anything unrecognized is an actual bug:
// it is persisted to the Logs page and answered with a generic message, since
// stacks and internal details must not travel to an MCP client.

// Several services answer a missing row with `null` because their only caller
// is a route that turns that into a 404. Tools raise this instead, so the
// model gets a message it can act on rather than a bare null.
export class McpResourceNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "McpResourceNotFoundError";
  }
}

const EXPECTED_ERRORS = [
  McpResourceNotFoundError,
  MailListResourceNotFoundError,
  MailItemNotFoundError,
  MailFolderMismatchError,
  MailSendNotAllowedError,
  MailSendRateLimitError,
  MailAccountNotFoundError,
  MailDraftNotFoundError,
  MailDraftContextNotFoundError,
  MailDraftFolderUnavailableError,
  MailTransportError,
  ServiceNotFoundError,
  CategoryHierarchyValidationError,
] as const;

const STACK_TRUNCATE_LENGTH = 1000;

function isExpected(error: unknown): error is Error {
  return EXPECTED_ERRORS.some((candidate) => error instanceof candidate);
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// Same two Prisma codes src/lib/api/errors.ts turns into a 400/404: a write
// naming a row that doesn't exist in this workspace (a cross-workspace id, for
// instance) is bad input, not a server fault.
const PRISMA_MESSAGES: Record<string, string> = {
  P2003: "Referenced resource does not exist in this workspace.",
  P2025: "Resource not found.",
};

export function toToolError(
  error: unknown,
  context: { workspaceId: string; toolName: string },
): CallToolResult {
  if (isExpected(error)) {
    return toolError(error.message);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = PRISMA_MESSAGES[error.code];
    if (message) return toolError(message);
  }

  const name =
    error instanceof Error ? error.name : (error?.constructor?.name ?? "Error");
  const details: Record<string, unknown> = {
    name,
    tool: context.toolName,
    message: error instanceof Error ? error.message : String(error),
  };
  if (error instanceof Error && error.stack) {
    details.stack = error.stack.slice(0, STACK_TRUNCATE_LENGTH);
  }
  logError(
    context.workspaceId,
    "mcp",
    `MCP tool ${context.toolName} failed`,
    JSON.stringify(details),
  );

  return toolError(
    `Tool ${context.toolName} failed unexpectedly. The error was recorded in the workspace logs.`,
  );
}
