import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import { categoryUpdateSchema } from "@/lib/validation/bookmarks";
import * as bookmarksService from "@/lib/services/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";

// PATCH/DELETE /api/categories/[id] — frozen contract (plan.md §5.1):
// PATCH {name} -> 200 {id,name}; DELETE -> 204, cascades to bookmarks
// (AC-BM-004).

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  await requireOperator();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await bookmarksService.renameCategory(id, parsed.data);
    return NextResponse.json({ id: category.id, name: category.name });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  await requireOperator();
  const { id } = await params;

  try {
    await bookmarksService.deleteCategory(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
