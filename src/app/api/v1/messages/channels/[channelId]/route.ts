import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiErrorResponse,
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { channelNameSchema } from "@/lib/validation/messagesApi";
import { MessageNameConflictError } from "@/lib/services/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:read");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const channel = await messagesService.getChannelForWorkspace(
    auth.workspaceId,
    channelId,
  );
  if (!channel) return apiNotFound("Channel");
  return apiJsonResponse(channel);
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

  let channel;
  try {
    channel = await messagesService.renameChannel(
      channelId,
      auth.workspaceId,
      parsed.data.name,
    );
  } catch (error) {
    if (error instanceof MessageNameConflictError) {
      return apiErrorResponse(409, error.code, error.message);
    }
    throw error;
  }
  recordTokenActivity(auth, {
    action: "update",
    entityType: "channel",
    entityId: channel.id,
    entityLabel: channel.name,
  });

  return apiJsonResponse(channel);
}
