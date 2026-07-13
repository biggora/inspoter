import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// messagesService.renameCategory/deleteCategory take no workspaceId (unlike
// alertsService/bookmarksService), so workspace ownership is verified here
// against the caller's own workspace before mutating.
async function categoryBelongsToWorkspace(workspaceId: string, categoryId: string): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) => category.id === categoryId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  if (!(await categoryBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await messagesService.renameCategory(id, parsed.data.name);
    return NextResponse.json(category);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  if (!(await categoryBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  try {
    await messagesService.deleteCategory(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
