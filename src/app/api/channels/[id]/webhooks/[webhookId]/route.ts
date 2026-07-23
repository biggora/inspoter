import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string; webhookId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id, webhookId } = await params;

  try {
    await webhookTokensService.revokeForChannel(id, webhookId, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "revoke",
      entityType: "channel_webhook",
      entityId: webhookId,
    });
    return emptyResponse();
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return jsonResponse({ error: "Resource not found." }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
