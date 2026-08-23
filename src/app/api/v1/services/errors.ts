import type { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { apiErrorResponse, apiNotFound } from "@/lib/api/token-auth";
import { ServiceNotFoundError } from "@/lib/services/services";
import {
  ServiceLabelLimitReachedError,
  ServiceLabelNameConflictError,
  ServiceLabelNotFoundError,
} from "@/lib/services/service-labels";

// Per-family error mapper for /api/v1/services/**, the token counterpart of
// the inline mapping the browser routes do — same statuses, but answered in
// the `{ error: { code, message } }` envelope token-auth.ts uses. Anything
// unrecognized is rethrown so the platform 500 handler sees it, exactly as the
// v1 contacts and messages routes do.
export function mapServiceError(error: unknown): NextResponse {
  if (
    error instanceof ServiceNotFoundError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025")
  ) {
    return apiNotFound("Service");
  }
  if (error instanceof ServiceLabelNotFoundError) {
    return apiNotFound("Service label");
  }
  if (error instanceof ServiceLabelNameConflictError) {
    return apiErrorResponse(409, error.code, error.message);
  }
  if (error instanceof ServiceLabelLimitReachedError) {
    return apiErrorResponse(409, error.code, error.message);
  }
  throw error;
}
