import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as conversations from "@/lib/services/agent-conversations";
import { recordActivity } from "@/lib/services/activity";
import {
  conversationCreateSchema,
  conversationListQuerySchema,
} from "@/lib/validation/agent-conversations";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const parsed = conversationListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await conversations.listConversations(auth.workspace.id, parsed.data),
    );
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const parsed = conversationCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const created = await conversations.createConversation(
      auth.workspace.id,
      parsed.data.agentId,
      parsed.data.message,
      { operatorId: auth.operator.id, operatorName: auth.operator.username },
    );
    void recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "create",
      entityType: "agent_conversation",
      entityId: created.conversationId,
      details: JSON.stringify({
        agentId: parsed.data.agentId,
        runId: created.run.id,
      }),
    });
    return jsonResponse(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}
