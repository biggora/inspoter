import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  approveAndExecuteDecision,
  transitionDecision,
  type ManagementActor,
} from "@/lib/services/management";
import { decisionTransitionSchema } from "@/lib/validation/management";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function humanActor(operator: {
  id: string;
  username: string;
}): ManagementActor {
  return { kind: "HUMAN", id: operator.id, name: operator.username };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const parsed = decisionTransitionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  const actor = humanActor(operator);
  const { id } = await params;
  try {
    return jsonResponse(
      parsed.data.transition === "APPROVE"
        ? await approveAndExecuteDecision(workspace.id, id, actor, parsed.data)
        : await transitionDecision(workspace.id, id, actor, parsed.data),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
