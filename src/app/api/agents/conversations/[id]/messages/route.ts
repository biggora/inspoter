import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as conversations from "@/lib/services/agent-conversations";
import { recordActivity } from "@/lib/services/activity";
import { conversationMessageSchema } from "@/lib/validation/agent-conversations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = conversationMessageSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const run = await conversations.sendConversationMessage(
      auth.workspace.id,
      id,
      parsed.data.message,
    );
    void recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "message",
      entityType: "agent_conversation",
      entityId: id,
      details: JSON.stringify({ runId: run.id }),
    });
    return jsonResponse(run, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}
