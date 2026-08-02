import { NextResponse, type NextRequest } from "next/server";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  apiJsonResponse,
  apiNotFound,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string; webhookId: string }>;
}

// Revoke, not delete: the row stays so the dashboard can still show that this
// webhook existed and when it was last used.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { channelId, webhookId } = await params;

  try {
    await webhookTokensService.revokeForChannel(
      channelId,
      webhookId,
      auth.workspaceId,
    );
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return apiNotFound("Channel webhook");
    }
    throw error;
  }

  recordTokenActivity(auth, {
    action: "delete",
    entityType: "channel_webhook",
    entityId: webhookId,
  });
  return apiJsonResponse({ id: webhookId, revoked: true });
}
