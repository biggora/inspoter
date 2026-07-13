import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { categorySchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  const { workspace } = await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await bookmarksService.createCategory(
      workspace.id,
      parsed.data,
    );
    return NextResponse.json(
      { id: category.id, name: category.name },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
