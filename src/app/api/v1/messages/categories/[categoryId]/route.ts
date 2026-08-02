import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { categoryNameSchema } from "@/lib/validation/messagesApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ categoryId: string }>;
}

// Rename only. Deleting a category cascades to its channels and their whole
// message history, so it stays an operator action in the dashboard.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { categoryId } = await params;

  const parsed = categoryNameSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  const existing = await messagesService.getCategoryForWorkspace(
    auth.workspaceId,
    categoryId,
  );
  if (!existing) return apiNotFound("Message category");

  const category = await messagesService.renameCategory(
    categoryId,
    auth.workspaceId,
    parsed.data.name,
  );
  recordTokenActivity(auth, {
    action: "update",
    entityType: "message_category",
    entityId: category.id,
    entityLabel: category.name,
  });

  return apiJsonResponse(category);
}
