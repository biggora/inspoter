import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
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
import { WebhookAccountHasNoTransportError } from "@/lib/mail/types";
import {
  MailLabelInUseError,
  MailLabelLimitReachedError,
  MailLabelNameConflictError,
  MailLabelResourceNotFoundError,
} from "@/lib/services/mail-labels";
import { MailLabelAssignmentResourceNotFoundError } from "@/lib/services/mail-label-assignments";
import {
  ActiveMailFilterRuleLimitReachedError,
  MailFilterRulePredicateRequiredError,
  MailFilterRuleResourceNotFoundError,
} from "@/lib/services/mail-filter-rules";
import {
  MailFilterRunResourceNotFoundError,
  MailFilterRunRetryConflictError,
} from "@/lib/services/mail-filter-runs";
import {
  AttachmentTooLargeError,
  AttachmentUnavailableError,
  MailAttachmentNotFoundError,
} from "@/lib/services/mail-attachments";
import {
  MailDraftContextNotFoundError,
  MailDraftFolderUnavailableError,
  MailDraftNotFoundError,
} from "@/lib/services/mail-drafts";
import { ServiceNotFoundError } from "@/lib/services/services";
import {
  ServiceLabelLimitReachedError,
  ServiceLabelNameConflictError,
  ServiceLabelNotFoundError,
} from "@/lib/services/service-labels";
import {
  AlertCategoryNotFoundError,
  AlertNotFoundError,
} from "@/lib/services/alerts";
import {
  BookmarkReorderValidationError,
  CategoryHierarchyValidationError,
} from "@/lib/services/bookmarks";
import {
  ContactImportTooLargeError,
  ContactMergeValidationError,
  ContactNotFoundError,
  ContactPhotoTooLargeError,
} from "@/lib/services/contacts";
import {
  ContactLabelLimitReachedError,
  ContactLabelNameConflictError,
  ContactLabelNotFoundError,
} from "@/lib/services/contact-labels";
import { UnknownContactFormatError } from "@/lib/contacts/formats";
import {
  KanbanLimitReachedError,
  KanbanNotFoundError,
  KanbanValidationError,
} from "@/lib/services/kanban";
import {
  KanbanLabelLimitReachedError,
  KanbanLabelNameConflictError,
  KanbanLabelNotFoundError,
} from "@/lib/services/kanban-labels";
import { ChannelNotFoundError } from "@/lib/services/messages";
import { ChannelWebhookNotFoundError } from "@/lib/services/webhookTokens";
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
  WebhookAccountHasNoTransportError,
  MailLabelResourceNotFoundError,
  MailLabelNameConflictError,
  MailLabelLimitReachedError,
  MailLabelInUseError,
  MailLabelAssignmentResourceNotFoundError,
  MailFilterRuleResourceNotFoundError,
  ActiveMailFilterRuleLimitReachedError,
  MailFilterRulePredicateRequiredError,
  MailFilterRunResourceNotFoundError,
  MailFilterRunRetryConflictError,
  MailAttachmentNotFoundError,
  AttachmentTooLargeError,
  AttachmentUnavailableError,
  MailDraftNotFoundError,
  MailDraftContextNotFoundError,
  MailDraftFolderUnavailableError,
  MailTransportError,
  ServiceNotFoundError,
  ServiceLabelNotFoundError,
  ServiceLabelNameConflictError,
  ServiceLabelLimitReachedError,
  CategoryHierarchyValidationError,
  BookmarkReorderValidationError,
  ContactNotFoundError,
  ContactMergeValidationError,
  ContactImportTooLargeError,
  ContactPhotoTooLargeError,
  ContactLabelNotFoundError,
  ContactLabelNameConflictError,
  ContactLabelLimitReachedError,
  UnknownContactFormatError,
  KanbanNotFoundError,
  KanbanValidationError,
  KanbanLimitReachedError,
  KanbanLabelNotFoundError,
  KanbanLabelNameConflictError,
  KanbanLabelLimitReachedError,
  AlertNotFoundError,
  AlertCategoryNotFoundError,
  ChannelNotFoundError,
  ChannelWebhookNotFoundError,
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

  // Conditional argument rules (a monitor needs a url or a host depending on
  // its type) are enforced by re-parsing with the shared validation schema, so
  // a ZodError is bad input the model can correct rather than a bug to log.
  if (error instanceof z.ZodError) {
    const issues = error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return toolError(`Invalid arguments — ${issues}`);
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
