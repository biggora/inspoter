import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { updateWebhookTokenScopesSchema } from "@/lib/validation/webhookTokens";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Edit a token's MCP scopes in place, so tightening or widening an agent's
// permissions doesn't force the operator to re-key every client.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateWebhookTokenScopesSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const token = await webhookTokensService.updateScopes(
      id,
      workspace.id,
      parsed.data.scopes,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "webhook_token",
      entityId: id,
      entityLabel: token.name,
    });
    return jsonResponse(token);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  try {
    if (permanent) {
      await webhookTokensService.remove(id, workspace.id);
      recordActivity(workspace.id, {
        operatorId: operator.id,
        operatorName: operator.username,
        action: "delete",
        entityType: "webhook_token",
        entityId: id,
      });
    } else {
      await webhookTokensService.revoke(id, workspace.id);
      recordActivity(workspace.id, {
        operatorId: operator.id,
        operatorName: operator.username,
        action: "revoke",
        entityType: "webhook_token",
        entityId: id,
      });
    }
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
