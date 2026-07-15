import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import {
  WorkspaceContextRequiredError,
  WorkspaceContextStaleError,
} from "@/lib/auth/dal";

// Shared Prisma-error -> HTTP response mapping (code-review fix, Slice 1,
// minor #4). Without this, a nonexistent categoryId on bookmark create
// (FK violation, P2003) or an update/delete against a missing id (P2025)
// surfaced as an unhandled 500 from all four Bookmarks route handlers.
// Machine-readable `{error}` shape mirrors the validation-error responses
// (architecture §3.7 style). Anything else is rethrown so it still
// surfaces as a 500 (unexpected — not swallowed).

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof WorkspaceContextRequiredError) {
    return NextResponse.json(
      { error: "WORKSPACE_CONTEXT_REQUIRED", message: error.message },
      { status: 400 },
    );
  }
  if (error instanceof WorkspaceContextStaleError) {
    return NextResponse.json(
      { error: "WORKSPACE_CONTEXT_STALE", message: error.message },
      { status: 409 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced resource does not exist." },
        { status: 400 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 },
      );
    }
  }
  throw error;
}
