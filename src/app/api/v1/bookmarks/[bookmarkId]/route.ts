import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { bookmarkUpdateSchema } from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ bookmarkId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "bookmarks:read");
  if (auth instanceof NextResponse) return auth;
  const { bookmarkId } = await params;

  const bookmark = await bookmarksService.getBookmark(
    bookmarkId,
    auth.workspaceId,
  );
  if (!bookmark) return apiNotFound("Bookmark");
  return apiJsonResponse(bookmark);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;
  const { bookmarkId } = await params;

  const parsed = bookmarkUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  // Resolve workspace scope first so a foreign id answers 404 rather than the
  // update's raw Prisma failure.
  const existing = await bookmarksService.getBookmark(
    bookmarkId,
    auth.workspaceId,
  );
  if (!existing) return apiNotFound("Bookmark");

  try {
    const bookmark = await bookmarksService.updateBookmark(
      bookmarkId,
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "bookmark",
      entityId: bookmark.id,
      entityLabel: bookmark.name,
    });
    return apiJsonResponse(bookmark);
  } catch (error) {
    return mapBookmarkError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;
  const { bookmarkId } = await params;

  const existing = await bookmarksService.getBookmark(
    bookmarkId,
    auth.workspaceId,
  );
  if (!existing) return apiNotFound("Bookmark");

  try {
    await bookmarksService.deleteBookmark(bookmarkId, auth.workspaceId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "bookmark",
      entityId: bookmarkId,
      entityLabel: existing.name,
    });
    return apiJsonResponse({ deleted: bookmarkId });
  } catch (error) {
    return mapBookmarkError(error);
  }
}
