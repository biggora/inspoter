import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { agentRunListQuerySchema } from "@/lib/validation/agents";
import * as agentRunsService from "@/lib/services/agent-runs";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Runs live at /api/agent-runs rather than under /api/agents so an agent id and
// the literal segment "runs" can never shadow each other in the router — the
// same reason skills are at /api/skills.

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = agentRunListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    return jsonResponse(
      await agentRunsService.listRuns(workspace.id, parsed.data),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
