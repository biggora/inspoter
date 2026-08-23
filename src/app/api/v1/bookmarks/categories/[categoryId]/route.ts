import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { categoryUpdateSchema } from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

// Deleting a category is deliberately not exposed here: it cascades to every
// bookmark inside it, and that stays an operator decision in the dashboard —
// the same line the Messages family draws at deleting a channel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ categoryId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;
  const { categoryId } = await params;

  const parsed = categoryUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const category = await bookmarksService.renameCategory(
      categoryId,
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "bookmark_category",
      entityId: category.id,
      entityLabel: category.name,
    });
    return apiJsonResponse({
      id: category.id,
      name: category.name,
      position: category.position,
      parentCategoryId: category.parentCategoryId,
    });
  } catch (error) {
    return mapBookmarkError(error, "Category");
  }
}
