import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  createManualDecision,
  listDecisions,
  type ManagementActor,
} from "@/lib/services/management";
import { createDecisionSchema } from "@/lib/validation/management";

const listQuerySchema = z.object({
  bucket: z.enum(["active", "deferred", "resolved"]).default("active"),
});

function humanActor(operator: {
  id: string;
  username: string;
}): ManagementActor {
  return { kind: "HUMAN", id: operator.id, name: operator.username };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const parsed = listQuerySchema.safeParse({
    bucket: request.nextUrl.searchParams.get("bucket") ?? undefined,
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(await listDecisions(workspace.id, parsed.data.bucket));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const parsed = createDecisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await createManualDecision(
        workspace.id,
        humanActor(operator),
        parsed.data,
      ),
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
