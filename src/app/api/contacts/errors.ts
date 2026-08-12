import type { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
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
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";

/**
 * One place mapping the Contacts service errors onto status codes, shared by
 * every /api/contacts/** handler so a 404 means the same thing on all of them.
 * Anything unrecognized falls through to the global mapper, which logs it and
 * lets it surface as a 500.
 */
export function mapContactError(
  error: unknown,
  workspaceId?: string,
): NextResponse {
  if (
    error instanceof ContactNotFoundError ||
    error instanceof ContactLabelNotFoundError
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
    error instanceof ContactLabelNameConflictError ||
    error instanceof ContactLabelLimitReachedError
  ) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (error instanceof ContactMergeValidationError) {
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: 400 },
    );
  }
  if (error instanceof UnknownContactFormatError) {
    return jsonResponse(
      { error: "CONTACT_FORMAT_UNKNOWN", message: error.message },
      { status: 400 },
    );
  }
  if (
    error instanceof ContactImportTooLargeError ||
    error instanceof ContactPhotoTooLargeError
  ) {
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: 413 },
    );
  }
  return toErrorResponse(error, workspaceId);
}
