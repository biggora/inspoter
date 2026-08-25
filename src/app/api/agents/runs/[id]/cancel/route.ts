import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as agentRunsService from "@/lib/services/agent-runs";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Cancellation is a request, not an act: a PENDING run is cancelled outright,
// a RUNNING one is flagged and stops at its next step boundary. Killing a
// half-finished tool call would leave the dashboard in a state nobody chose.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await agentRunsService.cancelRun(workspace.id, id);
    const run = await agentRunsService.getRunDetail(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "cancel",
      entityType: "agent_run",
      entityId: id,
      entityLabel: run.agentName,
    });
    return jsonResponse(run);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
