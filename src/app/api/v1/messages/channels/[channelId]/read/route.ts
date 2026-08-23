import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiNotFound,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";

// Read state is per channel and workspace-wide, so this is the same action
// opening the channel in the dashboard performs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const channel = await messagesService.getChannelForWorkspace(
    auth.workspaceId,
    channelId,
  );
  if (!channel) return apiNotFound("Channel");

  const result = await messagesService.markChannelRead(
    auth.workspaceId,
    channelId,
  );
  recordTokenActivity(auth, {
    action: "read",
    entityType: "channel",
    entityId: channelId,
    entityLabel: channel.name,
  });

  return apiJsonResponse(result);
}
