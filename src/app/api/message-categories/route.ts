import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const categories = await messagesService.listCategories(workspace.id);
  return jsonResponse(categories);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await messagesService.createCategory(
      workspace.id,
      parsed.data.name,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "message_category",
      entityId: category.id,
      entityLabel: category.name,
    });
    return jsonResponse(category, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
