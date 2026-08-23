import type { NextResponse } from "next/server";
import { apiErrorResponse, apiNotFound } from "@/lib/api/token-auth";
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

// Per-family error mapper for /api/v1/contacts/**, the token counterpart of
// src/app/api/contacts/errors.ts. It answers in the shared uppercase codes the
// rest of the /api/v1 surface uses, so one family never reports the same
// condition two different ways. Anything unrecognized is rethrown so the
// platform 500 handler sees it.
export function mapContactApiError(error: unknown): NextResponse {
  if (error instanceof ContactNotFoundError) return apiNotFound("Contact");
  if (error instanceof ContactLabelNotFoundError) {
    return apiNotFound("Contact label");
  }
  if (
    error instanceof ContactLabelNameConflictError ||
    error instanceof ContactLabelLimitReachedError
  ) {
    return apiErrorResponse(409, error.code, error.message);
  }
  if (error instanceof ContactMergeValidationError) {
    return apiErrorResponse(400, "VALIDATION_FAILED", error.message);
  }
  if (error instanceof UnknownContactFormatError) {
    return apiErrorResponse(400, "UNKNOWN_FORMAT", error.message);
  }
  if (
    error instanceof ContactImportTooLargeError ||
    error instanceof ContactPhotoTooLargeError
  ) {
    return apiErrorResponse(413, "PAYLOAD_TOO_LARGE", error.message);
  }
  throw error;
}
