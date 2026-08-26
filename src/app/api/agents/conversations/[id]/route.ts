import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as conversations from "@/lib/services/agent-conversations";
import { recordActivity } from "@/lib/services/activity";
import { conversationUpdateSchema } from "@/lib/validation/agent-conversations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return jsonResponse(
      await conversations.getConversation(auth.workspace.id, id),
    );
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = conversationUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const updated = await conversations.updateConversation(
      auth.workspace.id,
      id,
      parsed.data,
      { operatorId: auth.operator.id, operatorName: auth.operator.username },
    );
    void recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: parsed.data.agentId ? "reassign" : "update",
      entityType: "agent_conversation",
      entityId: id,
      entityLabel: updated.title,
      details: JSON.stringify({
        archived: parsed.data.archived,
        agentId: parsed.data.agentId,
        scopeDowngradeConfirmed:
          parsed.data.acknowledgeScopeDowngrade === true,
      }),
    });
    return jsonResponse(updated);
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await conversations.deleteConversation(auth.workspace.id, id);
    void recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "delete",
      entityType: "agent_conversation",
      entityId: id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}
