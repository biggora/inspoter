import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Category workspace ownership is verified here before mutating,
// in addition to the workspace CHECK constraint enforced at the DB layer.
async function categoryBelongsToWorkspace(
  workspaceId: string,
  categoryId: string,
): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) => category.id === categoryId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await categoryBelongsToWorkspace(workspace.id, id))) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await messagesService.renameCategory(
      id,
      workspace.id,
      parsed.data.name,
    );
    return jsonResponse(category);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await categoryBelongsToWorkspace(workspace.id, id))) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }

  try {
    await messagesService.deleteCategory(id, workspace.id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
