import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { agentScheduleUpdateSchema } from "@/lib/validation/agents";
import * as schedulesService from "@/lib/services/agent-schedules";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string; scheduleId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { scheduleId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = agentScheduleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const schedule = await schedulesService.updateSchedule(
      workspace.id,
      scheduleId,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "agent_schedule",
      entityId: scheduleId,
      entityLabel: schedule.name,
    });
    return jsonResponse(schedule);
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
  const { scheduleId } = await params;

  try {
    await schedulesService.deleteSchedule(workspace.id, scheduleId);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "agent_schedule",
      entityId: scheduleId,
      entityLabel: scheduleId,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
