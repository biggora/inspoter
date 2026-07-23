import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { categoryReorderSchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = categoryReorderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await bookmarksService.reorderCategories(workspace.id, parsed.data.order);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "reorder",
      entityType: "category",
      entityId: null,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    if (error instanceof bookmarksService.BookmarkReorderValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
