import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { agentUpdateSchema } from "@/lib/validation/agents";
import * as agentsService from "@/lib/services/agents";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    return jsonResponse(await agentsService.getAgent(workspace.id, id));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = agentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const agent = await agentsService.updateAgent(
      workspace.id,
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "agent",
      entityId: id,
      entityLabel: agent.name,
    });
    return jsonResponse(agent);
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

  try {
    // Read the name before the delete so the journal entry can carry it; the
    // row is gone by the time recordActivity runs.
    const agent = await agentsService.getAgent(workspace.id, id);
    await agentsService.deleteAgent(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "agent",
      entityId: id,
      entityLabel: agent.name,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
