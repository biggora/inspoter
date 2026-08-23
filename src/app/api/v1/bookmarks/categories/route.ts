import { NextResponse, type NextRequest } from "next/server";
import * as bookmarksService from "@/lib/services/bookmarks";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { categorySchema } from "@/lib/validation/bookmarks";
import { mapBookmarkError } from "@/app/api/v1/bookmarks/errors";

// Static segment, so it wins over /api/v1/bookmarks/[bookmarkId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:read");
  if (auth instanceof NextResponse) return auth;

  const tree = await bookmarksService.list(auth.workspaceId);
  return apiJsonResponse(
    tree.map((category) => ({
      id: category.id,
      name: category.name,
      position: category.position,
      bookmarkCount: category.bookmarks.length,
      childCategories: category.childCategories.map((child) => ({
        id: child.id,
        name: child.name,
        position: child.position,
        bookmarkCount: child.bookmarks.length,
      })),
    })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = categorySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const category = await bookmarksService.createCategory(
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "bookmark_category",
      entityId: category.id,
      entityLabel: category.name,
    });
    return apiJsonResponse(
      { id: category.id, name: category.name, position: category.position },
      { status: 201 },
    );
  } catch (error) {
    return mapBookmarkError(error, "Category");
  }
}
