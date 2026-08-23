import type { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { apiErrorResponse, apiNotFound } from "@/lib/api/token-auth";
import {
  BookmarkReorderValidationError,
  CategoryHierarchyValidationError,
} from "@/lib/services/bookmarks";

// Per-family error mapper for /api/v1/bookmarks/**, the token counterpart of
// the inline mapping the browser routes do. Anything unrecognized is rethrown
// so the platform 500 handler sees it.
export function mapBookmarkError(
  error: unknown,
  resource: "Bookmark" | "Category" = "Bookmark",
): NextResponse {
  if (
    error instanceof CategoryHierarchyValidationError ||
    error instanceof BookmarkReorderValidationError
  ) {
    return apiErrorResponse(400, "VALIDATION_FAILED", error.message);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: the row named by the path does not exist in this workspace.
    // P2003: the body references a row that does not — a foreign categoryId.
    if (error.code === "P2025") return apiNotFound(resource);
    if (error.code === "P2003") {
      return apiErrorResponse(
        400,
        "VALIDATION_FAILED",
        "Referenced resource does not exist in this workspace.",
      );
    }
  }
  throw error;
}
