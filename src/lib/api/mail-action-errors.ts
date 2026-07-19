import { NextResponse } from "next/server";
import {
  MailTransportError,
  WebhookAccountHasNoTransportError,
} from "@/lib/mail";
import {
  MailFolderMismatchError,
  MailItemNotFoundError,
  MailSendNotAllowedError,
  MailSendRateLimitError,
} from "@/lib/services/mail-actions";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import {
  AttachmentTooLargeError,
  AttachmentUnavailableError,
  MailAttachmentNotFoundError,
} from "@/lib/services/mail-attachments";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Shared error mapping for the mail item action routes (PATCH/DELETE
// /api/mail/[id], /api/mail/[id]/move, /api/mail/send) — same status
// conventions as /api/mail/accounts/[id] (MailTransportError → 502 etc.).
export function mailActionErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof MailItemNotFoundError ||
    error instanceof MailAccountNotFoundError ||
    error instanceof MailAttachmentNotFoundError
  ) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (error instanceof AttachmentUnavailableError) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  if (error instanceof AttachmentTooLargeError) {
    return jsonResponse({ error: error.message }, { status: 413 });
  }
  if (
    error instanceof MailFolderMismatchError ||
    error instanceof MailSendNotAllowedError ||
    error instanceof WebhookAccountHasNoTransportError
  ) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
  if (error instanceof MailSendRateLimitError) {
    return jsonResponse({ error: error.message }, { status: 429 });
  }
  if (error instanceof MailTransportError) {
    return jsonResponse({ error: error.message }, { status: 502 });
  }
  return toErrorResponse(error);
}
