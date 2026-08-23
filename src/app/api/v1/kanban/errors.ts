import type { NextResponse } from "next/server";
import { apiErrorResponse, apiNotFound } from "@/lib/api/token-auth";
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

// Per-family error mapper for /api/v1/kanban/**, the token counterpart of the
// mapping src/lib/api/errors.ts does for the browser routes — same statuses,
// answered in the `{ error: { code, message } }` envelope token-auth.ts uses.
// Anything unrecognized is rethrown so the platform 500 handler sees it.
export function mapKanbanError(
  error: unknown,
  resource = "Kanban resource",
): NextResponse {
  if (error instanceof KanbanNotFoundError) return apiNotFound(resource);
  if (error instanceof KanbanLabelNotFoundError) {
    return apiNotFound("Kanban label");
  }
  if (error instanceof KanbanValidationError) {
    return apiErrorResponse(400, "VALIDATION_FAILED", error.message);
  }
  if (
    error instanceof KanbanLimitReachedError ||
    error instanceof KanbanLabelNameConflictError ||
    error instanceof KanbanLabelLimitReachedError
  ) {
    return apiErrorResponse(409, error.code, error.message);
  }
  throw error;
}
