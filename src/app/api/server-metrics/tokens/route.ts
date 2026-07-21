import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import {
  listAgentTokens,
  generateEnrollmentToken,
} from "@/lib/services/serverMetrics";
import { z } from "zod";

const createTokenSchema = z.strictObject({
  name: z.string().min(1).max(255),
  localServerId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  try {
    const tokens = await listAgentTokens(workspace.id);
    return jsonResponse(tokens);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
  } catch (error) {
    return toErrorResponse(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = createTokenSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const token = await generateEnrollmentToken(
      workspace.id,
      parsed.data.name,
      parsed.data.localServerId,
    );
    return jsonResponse(token, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
