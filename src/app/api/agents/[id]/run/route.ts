import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { agentRunCreateSchema } from "@/lib/validation/agents";
import * as agentRunsService from "@/lib/services/agent-runs";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Queues a run rather than executing it here: a run can take minutes across N
// model round-trips, and an HTTP request is the wrong place to hold that. The
// in-process scheduler (src/lib/services/agent-scheduler.ts) picks it up on its
// next tick, exactly as it does for a scheduled one.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = agentRunCreateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const run = await agentRunsService.createManualRun(
      workspace.id,
      id,
      parsed.data.task ?? null,
    );
    // Null means the idempotency key collided, which a manual run's fresh uuid
    // makes impossible; treat it as a conflict rather than pretending.
    if (!run) {
      return jsonResponse({ error: "AGENT_RUN_CONFLICT" }, { status: 409 });
    }
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "run",
      entityType: "agent",
      entityId: id,
      entityLabel: run.agentName,
      details: JSON.stringify({ runId: run.id, trigger: "MANUAL" }),
    });
    return jsonResponse(run, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
