import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    await webhookTokensService.revoke(id, workspace.id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
