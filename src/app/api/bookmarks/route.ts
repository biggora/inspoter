import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import { bookmarkSchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

// POST /api/bookmarks — frozen contract (plan.md §5.1):
// {name,url,icon?,description?,categoryId} -> 201. Validation failures ->
// 400 with zod issues (AC-BM-007/008). A nonexistent categoryId fails the
// DB foreign-key constraint (P2003) -> mapped to 400 by toErrorResponse.

export async function POST(request: NextRequest) {
  await requireOperator();

  const body = await request.json().catch(() => null);
  const parsed = bookmarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const bookmark = await bookmarksService.createBookmark(parsed.data);
    return NextResponse.json(bookmark, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
