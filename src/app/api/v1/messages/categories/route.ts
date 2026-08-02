import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { categoryNameSchema } from "@/lib/validation/messagesApi";

// Agent-facing message categories. Session-cookie-free: the bearer token is
// the sole authority and carries the workspace (see src/lib/api/token-auth.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "messages:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(
    await messagesService.listCategories(auth.workspaceId),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = categoryNameSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  // Get-or-create by name: re-running the same setup must not leave the
  // workspace with three identically named categories. 200 means "already
  // there", 201 means a row was written.
  const { category, created } =
    await messagesService.findOrCreateCategoryByName(
      auth.workspaceId,
      parsed.data.name,
    );
  if (created) {
    recordTokenActivity(auth, {
      action: "create",
      entityType: "message_category",
      entityId: category.id,
      entityLabel: category.name,
    });
  }

  return apiJsonResponse(category, { status: created ? 201 : 200 });
}
