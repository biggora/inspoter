import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  getDecision,
  updateDecision,
  type ManagementActor,
} from "@/lib/services/management";
import { updateDecisionSchema } from "@/lib/validation/management";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function humanActor(operator: {
  id: string;
  username: string;
}): ManagementActor {
  return { kind: "HUMAN", id: operator.id, name: operator.username };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  try {
    return jsonResponse(await getDecision(workspace.id, (await params).id));
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
  const parsed = updateDecisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await updateDecision(
        workspace.id,
        (await params).id,
        humanActor(operator),
        parsed.data,
      ),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
