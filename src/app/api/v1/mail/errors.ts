import type { NextResponse } from "next/server";
import { apiErrorResponse, apiNotFound } from "@/lib/api/token-auth";
import { MailTransportError } from "@/lib/mail";
import { WebhookAccountHasNoTransportError } from "@/lib/mail/types";
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

// Per-family error mapper for /api/v1/mail/**, the token counterpart of
// src/lib/api/mail-action-errors.ts and the inline mapping the browser routes
// do — same statuses, answered in the `{ error: { code, message } }` envelope.
// Anything unrecognized is rethrown so the platform 500 handler sees it.
export function mapMailError(error: unknown): NextResponse {
  if (
    error instanceof MailItemNotFoundError ||
    error instanceof MailListResourceNotFoundError ||
    error instanceof MailAccountNotFoundError ||
    error instanceof MailDraftNotFoundError ||
    error instanceof MailDraftContextNotFoundError ||
    error instanceof MailLabelResourceNotFoundError ||
    error instanceof MailLabelAssignmentResourceNotFoundError ||
    error instanceof MailFilterRuleResourceNotFoundError ||
    error instanceof MailFilterRunResourceNotFoundError ||
    error instanceof MailAttachmentNotFoundError
  ) {
    return apiNotFound("Mail resource");
  }

  if (
    error instanceof MailFolderMismatchError ||
    error instanceof MailFilterRulePredicateRequiredError ||
    error instanceof WebhookAccountHasNoTransportError
  ) {
    return apiErrorResponse(400, "VALIDATION_FAILED", error.message);
  }

  // Sending from an inbound-only account is a permission fact about the
  // account, not a missing scope, so it stays a 400 rather than a 403.
  if (error instanceof MailSendNotAllowedError) {
    return apiErrorResponse(400, "VALIDATION_FAILED", error.message);
  }

  if (
    error instanceof MailLabelNameConflictError ||
    error instanceof MailLabelLimitReachedError ||
    error instanceof MailLabelInUseError ||
    error instanceof ActiveMailFilterRuleLimitReachedError ||
    error instanceof MailFilterRunRetryConflictError
  ) {
    return apiErrorResponse(409, error.code, error.message);
  }

  if (error instanceof AttachmentTooLargeError) {
    return apiErrorResponse(413, "PAYLOAD_TOO_LARGE", error.message);
  }

  // The per-workspace send limit is separate from, and stricter than, the
  // per-token rate limit token-auth.ts applies.
  if (error instanceof MailSendRateLimitError) {
    return apiErrorResponse(429, "RATE_LIMITED", error.message);
  }

  if (
    error instanceof MailTransportError ||
    error instanceof MailDraftFolderUnavailableError ||
    error instanceof AttachmentUnavailableError
  ) {
    return apiErrorResponse(502, "UPSTREAM_FAILED", error.message);
  }

  throw error;
}
