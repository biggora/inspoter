import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { createChannelSchema } from "@/lib/validation/messagesApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = createChannelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  const category = await messagesService.getCategoryForWorkspace(
    auth.workspaceId,
    parsed.data.categoryId,
  );
  if (!category) return apiNotFound("Message category");

  // Get-or-create within the category, like POST /categories.
  const { channel, created } = await messagesService.findOrCreateChannelByName(
    auth.workspaceId,
    parsed.data.categoryId,
    parsed.data.name,
  );
  if (created) {
    recordTokenActivity(auth, {
      action: "create",
      entityType: "channel",
      entityId: channel.id,
      entityLabel: channel.name,
    });
  }

  return apiJsonResponse(channel, { status: created ? 201 : 200 });
}
