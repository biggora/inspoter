import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { bookmarkSchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  await requireAuth();

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
