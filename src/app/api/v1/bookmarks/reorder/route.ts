import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { bookmarkReorderSchema } from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

// Static segment, so it wins over /api/v1/bookmarks/[bookmarkId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = bookmarkReorderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await bookmarksService.reorderBookmarks(
      auth.workspaceId,
      parsed.data.categories,
    );
    recordTokenActivity(auth, { action: "reorder", entityType: "bookmark" });
    return apiJsonResponse({ reordered: true });
  } catch (error) {
    return mapBookmarkError(error);
  }
}
