import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  bookmarkSchema,
  bookmarkSearchQuerySchema,
} from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

// Agent-facing bookmarks. Session-cookie-free: the bearer token is the sole
// authority and carries the workspace (see src/lib/api/token-auth.ts).
//
// This is the first HTTP read of the bookmark tree in the codebase — the
// dashboard page calls the service directly from a server component — so the
// flat, searchable shape here is the one the MCP tools already answer with.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = bookmarkSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  return apiJsonResponse(
    await bookmarksService.search(auth.workspaceId, parsed.data),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = bookmarkSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const bookmark = await bookmarksService.createBookmark(
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "bookmark",
      entityId: bookmark.id,
      entityLabel: bookmark.name,
    });
    return apiJsonResponse(bookmark, { status: 201 });
  } catch (error) {
    return mapBookmarkError(error);
  }
}
