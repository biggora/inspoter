import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { channelNameSchema } from "@/lib/validation/messagesApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string }>;
}

// Rename only — deleting a channel would take its message history with it.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const parsed = channelNameSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  const existing = await messagesService.getChannelForWorkspace(
    auth.workspaceId,
    channelId,
  );
  if (!existing) return apiNotFound("Channel");

  const channel = await messagesService.renameChannel(
    channelId,
    auth.workspaceId,
    parsed.data.name,
  );
  recordTokenActivity(auth, {
    action: "update",
    entityType: "channel",
    entityId: channel.id,
    entityLabel: channel.name,
  });

  return apiJsonResponse(channel);
}
