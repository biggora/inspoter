import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  bookmarkSchema,
  bookmarkSearchQuerySchema,
} from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

// The dashboard renders the bookmark tree from a server component, so this
// read exists for the in-page clients that have no server render to piggyback
// on (the WebMCP tools). It answers with the same flat, searchable shape as
// the agent-facing /api/v1/bookmarks and the MCP `bookmarks_search` tool,
// because all three call bookmarksService.search().
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const parsed = bookmarkSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    return jsonResponse(
      await bookmarksService.search(workspace.id, parsed.data),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = bookmarkSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const bookmark = await bookmarksService.createBookmark(
      workspace.id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "bookmark",
      entityId: bookmark.id,
      entityLabel: parsed.data.name,
    });
    return jsonResponse(bookmark, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
