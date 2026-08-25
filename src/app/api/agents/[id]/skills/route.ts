import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { agentSkillsSetSchema } from "@/lib/validation/agents";
import * as agentsService from "@/lib/services/agents";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PUT, not POST: the request carries the agent's whole skill list, and the
// array order is the injection order. A partial attach/detach pair plus a
// separate reorder would let the two drift.
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = agentSkillsSetSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const agent = await agentsService.setAgentSkills(
      workspace.id,
      id,
      parsed.data.skillIds,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "agent",
      entityId: id,
      entityLabel: agent.name,
      details: JSON.stringify({ skills: parsed.data.skillIds.length }),
    });
    return jsonResponse(agent);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
