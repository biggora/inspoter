import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import {
  MailTemplateContentError,
  MailTemplateLimitReachedError,
  MailTemplateNameConflictError,
  MailTemplateNotFoundError,
  MailTemplateTagLimitReachedError,
  MailTemplateTagNameConflictError,
  MailTemplateTagNotFoundError,
} from "@/lib/services/mail-templates";
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";

export function mailTemplateErrorResponse(
  error: unknown,
  workspaceId?: string,
): NextResponse {
  if (
    error instanceof MailTemplateNotFoundError ||
    error instanceof MailTemplateTagNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WorkspaceMemberRequiredError) {
    return jsonResponse(
      { error: "WORKSPACE_MEMBER_REQUIRED" },
      { status: 403 },
    );
  }
  if (
    error instanceof MailTemplateNameConflictError ||
    error instanceof MailTemplateTagNameConflictError ||
    error instanceof MailTemplateLimitReachedError ||
    error instanceof MailTemplateTagLimitReachedError
  ) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (error instanceof MailTemplateContentError) {
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: 400 },
    );
  }
  return toErrorResponse(error, workspaceId);
}
