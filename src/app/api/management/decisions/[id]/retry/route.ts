import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  executeDecisionAction,
  type ManagementActor,
} from "@/lib/services/management";
import { retryDecisionSchema } from "@/lib/validation/management";

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
  const parsed = retryDecisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await executeDecisionAction(
        workspace.id,
        (await params).id,
        humanActor(operator),
        parsed.data.expectedVersion,
      ),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
