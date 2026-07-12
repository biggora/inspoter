import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import { bookmarkUpdateSchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

// PATCH/DELETE /api/bookmarks/[id] — frozen contract (plan.md §5.1):
// PATCH partial {name,url,icon,description,categoryId} -> 200 (AC-BM-009);
// DELETE -> 204 (AC-BM-010). Missing id -> P2025 -> 404; nonexistent
// categoryId on PATCH -> P2003 -> 400 (toErrorResponse).

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  await requireOperator();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = bookmarkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const bookmark = await bookmarksService.updateBookmark(id, parsed.data);
    return NextResponse.json(bookmark);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  await requireOperator();
  const { id } = await params;

  try {
    await bookmarksService.deleteBookmark(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
