import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import { categorySchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

// POST /api/categories — frozen contract (plan.md §5.1): {name} -> 201
// {id,name}. Validation failures -> 400 with zod issues (AC-BM-005).

export async function POST(request: NextRequest) {
  await requireOperator();

  const body = await request.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await bookmarksService.createCategory(parsed.data);
    return NextResponse.json({ id: category.id, name: category.name }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
