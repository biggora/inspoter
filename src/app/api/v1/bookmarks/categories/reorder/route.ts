import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { categoryReorderSchema } from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = categoryReorderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await bookmarksService.reorderCategories(
      auth.workspaceId,
      parsed.data.order,
    );
    recordTokenActivity(auth, {
      action: "reorder",
      entityType: "bookmark_category",
    });
    return apiJsonResponse({ reordered: true });
  } catch (error) {
    return mapBookmarkError(error, "Category");
  }
}
